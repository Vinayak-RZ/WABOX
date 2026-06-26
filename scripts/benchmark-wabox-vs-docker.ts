/**
 * Compare WABOX (native MXC) vs Docker one-shot `docker run` for agent-style exec.
 *
 * Usage:
 *   npm run benchmark
 *   npm run benchmark -- --iterations 5 --docker-image node:22-alpine
 *
 * Results: .wabox/benchmarks/<timestamp>.json
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgentSandbox, getSupportStatus } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

interface BenchCase {
  id: string;
  label: string;
  /** WABOX shell command (runs on host Windows) */
  waboxCommand: string;
  /** argv after image name for docker run */
  dockerArgv: string[];
}

interface Sample {
  iteration: number;
  durationMs: number;
  exitCode: number;
  ok: boolean;
  error?: string;
}

interface CaseResult {
  case: BenchCase;
  coldStartMs: number | null;
  samples: Sample[];
  stats: {
    count: number;
    successRate: number;
    minMs: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
    meanMs: number;
  };
}

interface BenchmarkReport {
  generatedAt: string;
  host: {
    platform: string;
    nodeVersion: string;
    cpus: number;
    memoryGb: number;
  };
  wabox: {
    support: ReturnType<typeof getSupportStatus>;
    isolationTier?: string;
  };
  docker: {
    available: boolean;
    version?: string;
    image: string;
    imagePullMs?: number;
  };
  methodology: {
    waboxModel: string;
    dockerModel: string;
    workspaceMount: string;
    note: string;
  };
  cases: Array<{
    caseId: string;
    wabox: CaseResult;
    docker: CaseResult;
    comparison: {
      meanSpeedup: number | null;
      p50Speedup: number | null;
      winnerByMean: 'wabox' | 'docker' | 'tie' | 'n/a';
    };
  }>;
}

function parseArgs(argv: string[]): { iterations: number; dockerImage: string } {
  let iterations = 3;
  let dockerImage = 'node:22-alpine';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--iterations' && argv[i + 1]) {
      iterations = Math.max(1, Number.parseInt(argv[++i], 10));
    }
    if (argv[i] === '--docker-image' && argv[i + 1]) {
      dockerImage = argv[++i];
    }
  }

  return { iterations, dockerImage };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]!;
}

function summarize(samples: Sample[]) {
  const ok = samples.filter((s) => s.ok);
  const durations = ok.map((s) => s.durationMs).sort((a, b) => a - b);
  const mean = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  return {
    count: samples.length,
    successRate: samples.length ? ok.length / samples.length : 0,
    minMs: durations[0] ?? 0,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    maxMs: durations[durations.length - 1] ?? 0,
    meanMs: mean,
  };
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

async function runDocker(
  image: string,
  argv: string[],
  workspace: string,
  timeoutMs: number,
): Promise<{ durationMs: number; exitCode: number; stderr: string }> {
  const mount = `${toPosix(workspace)}:/work`;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['run', '--rm', '-v', mount, '-w', '/work', image, ...argv],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderr = '';
    child.stderr?.on('data', (c) => {
      stderr += c.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`docker timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        durationMs: Date.now() - started,
        exitCode: code ?? -1,
        stderr,
      });
    });
  });
}

async function ensureDockerImage(image: string): Promise<{ version: string; pullMs?: number }> {
  const version = await new Promise<string>((resolve, reject) => {
    const child = spawn('docker', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout?.on('data', (c) => {
      out += c.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error('docker not available'));
      else resolve(out.trim());
    });
  });

  const inspect = await new Promise<boolean>((resolve) => {
    const child = spawn('docker', ['image', 'inspect', image], { stdio: 'ignore' });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });

  if (inspect) return { version };

  const pullStarted = Date.now();
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', ['pull', image], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`docker pull failed for ${image}`));
      else resolve();
    });
  });

  return { version, pullMs: Date.now() - pullStarted };
}

async function benchmarkWabox(
  benchCase: BenchCase,
  iterations: number,
  workspace: string,
  execTimeoutMs: number,
): Promise<CaseResult> {
  const samples: Sample[] = [];
  let coldStartMs: number | null = null;

  for (let i = 0; i < iterations; i++) {
    const sandbox = createAgentSandbox({
      preset: 'node-dev',
      sessionLabel: `benchmark-${benchCase.id}`,
      policy: { filesystem: { workspacePath: workspace } },
      logDir: path.join(REPO_ROOT, '.wabox', 'benchmark-sessions'),
    });

    const started = Date.now();
    try {
      const result = await sandbox.exec(benchCase.waboxCommand, {
        label: benchCase.id,
        timeoutMs: execTimeoutMs,
      });
      const durationMs = Date.now() - started;
      if (coldStartMs === null) coldStartMs = durationMs;
      samples.push({
        iteration: i + 1,
        durationMs,
        exitCode: result.exitCode,
        ok: result.exitCode === 0,
        error: result.exitCode !== 0 ? result.stderr.slice(0, 500) : undefined,
      });
    } catch (error) {
      const durationMs = Date.now() - started;
      if (coldStartMs === null) coldStartMs = durationMs;
      samples.push({
        iteration: i + 1,
        durationMs,
        exitCode: -1,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await sandbox.destroy().catch(() => undefined);
    }
  }

  return { case: benchCase, coldStartMs, samples, stats: summarize(samples) };
}

async function benchmarkDocker(
  benchCase: BenchCase,
  iterations: number,
  workspace: string,
  image: string,
  execTimeoutMs: number,
): Promise<CaseResult> {
  const samples: Sample[] = [];
  let coldStartMs: number | null = null;

  for (let i = 0; i < iterations; i++) {
    const started = Date.now();
    try {
      const result = await runDocker(image, benchCase.dockerArgv, workspace, execTimeoutMs);
      const durationMs = Date.now() - started;
      if (coldStartMs === null) coldStartMs = durationMs;
      samples.push({
        iteration: i + 1,
        durationMs,
        exitCode: result.exitCode,
        ok: result.exitCode === 0,
        error: result.exitCode !== 0 ? result.stderr.slice(0, 500) : undefined,
      });
    } catch (error) {
      const durationMs = Date.now() - started;
      if (coldStartMs === null) coldStartMs = durationMs;
      samples.push({
        iteration: i + 1,
        durationMs,
        exitCode: -1,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { case: benchCase, coldStartMs, samples, stats: summarize(samples) };
}

function compareResults(wabox: CaseResult, docker: CaseResult) {
  const meanSpeedup =
    wabox.stats.meanMs > 0 && docker.stats.meanMs > 0
      ? docker.stats.meanMs / wabox.stats.meanMs
      : null;
  const p50Speedup =
    wabox.stats.p50Ms > 0 && docker.stats.p50Ms > 0
      ? docker.stats.p50Ms / wabox.stats.p50Ms
      : null;

  let winnerByMean: 'wabox' | 'docker' | 'tie' | 'n/a' = 'n/a';
  if (wabox.stats.meanMs > 0 && docker.stats.meanMs > 0) {
    const ratio = wabox.stats.meanMs / docker.stats.meanMs;
    if (ratio < 0.9) winnerByMean = 'wabox';
    else if (ratio > 1.1) winnerByMean = 'docker';
    else winnerByMean = 'tie';
  }

  return { meanSpeedup, p50Speedup, winnerByMean };
}

function printSummary(report: BenchmarkReport): void {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' WABOX vs Docker — Agent Exec Benchmark');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Host: ${report.host.platform} · Node ${report.host.nodeVersion}`);
  console.log(`WABOX tier: ${report.wabox.isolationTier ?? 'unknown'}`);
  console.log(`Docker: ${report.docker.version ?? 'n/a'} · image ${report.docker.image}`);
  if (report.docker.imagePullMs) {
    console.log(`Docker image pull (one-time): ${report.docker.imagePullMs}ms`);
  }
  console.log(`\nModel: ${report.methodology.note}\n`);

  for (const row of report.cases) {
    console.log(`── ${row.caseId} ──`);
    console.log(
      `  WABOX  mean ${row.wabox.stats.meanMs.toFixed(0)}ms · p50 ${row.wabox.stats.p50Ms.toFixed(0)}ms · cold ${row.wabox.coldStartMs?.toFixed(0) ?? 'n/a'}ms · ok ${(row.wabox.stats.successRate * 100).toFixed(0)}%`,
    );
    console.log(
      `  Docker mean ${row.docker.stats.meanMs.toFixed(0)}ms · p50 ${row.docker.stats.p50Ms.toFixed(0)}ms · cold ${row.docker.coldStartMs?.toFixed(0) ?? 'n/a'}ms · ok ${(row.docker.stats.successRate * 100).toFixed(0)}%`,
    );
    if (row.comparison.meanSpeedup !== null) {
      const faster = row.comparison.meanSpeedup > 1 ? 'WABOX' : 'Docker';
      const factor = row.comparison.meanSpeedup > 1 ? row.comparison.meanSpeedup : 1 / row.comparison.meanSpeedup;
      console.log(`  → ${faster} ~${factor.toFixed(2)}× faster (mean)`);
    }
    console.log('');
  }
}

const BENCH_CASES: BenchCase[] = [
  {
    id: 'echo',
    label: 'Shell echo',
    waboxCommand: 'cmd /c echo benchmark-ok',
    dockerArgv: ['echo', 'benchmark-ok'],
  },
  {
    id: 'node-eval',
    label: 'Node one-liner',
    waboxCommand: 'node -e "console.log(42)"',
    dockerArgv: ['node', '-e', 'console.log(42)'],
  },
  {
    id: 'npm-version',
    label: 'npm --version',
    waboxCommand: 'npm --version',
    dockerArgv: ['npm', '--version'],
  },
];

async function main(): Promise<void> {
  const { iterations, dockerImage } = parseArgs(process.argv.slice(2));
  const support = getSupportStatus();

  if (!support.supported) {
    console.error('WABOX not supported on this host:');
    for (const e of support.errors) console.error(' -', e);
    process.exit(1);
  }

  console.log('Ensuring Docker image...');
  const dockerInfo = await ensureDockerImage(dockerImage);

  const execTimeoutMs = 180_000;
  const workspace = REPO_ROOT;
  const outDir = path.join(REPO_ROOT, '.wabox', 'benchmarks');
  await fs.mkdir(outDir, { recursive: true });

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    host: {
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      nodeVersion: process.versions.node,
      cpus: os.cpus().length,
      memoryGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    },
    wabox: {
      support,
      isolationTier: support.isolationTier,
    },
    docker: {
      available: true,
      version: dockerInfo.version,
      image: dockerImage,
      imagePullMs: dockerInfo.pullMs,
    },
    methodology: {
      waboxModel: 'One MXC spawn per exec() — matches WABOX MVP',
      dockerModel: 'One docker run --rm per iteration — same one-shot agent pattern',
      workspaceMount: `${toPosix(workspace)} → /work`,
      note:
        'Fair for agent loops that spawn per command. Not comparable to long-lived docker exec sessions (WABOX v2 stateful). Docker on Windows uses Linux containers via WSL2/Hyper-V — extra VM boundary vs native MXC.',
    },
    cases: [],
  };

  for (const benchCase of BENCH_CASES) {
    console.log(`\nBenchmarking: ${benchCase.label} (${iterations} iterations)`);
    console.log('  WABOX...');
    const wabox = await benchmarkWabox(benchCase, iterations, workspace, execTimeoutMs);
    console.log('  Docker...');
    const docker = await benchmarkDocker(benchCase, iterations, workspace, dockerImage, execTimeoutMs);

    report.cases.push({
      caseId: benchCase.id,
      wabox,
      docker,
      comparison: compareResults(wabox, docker),
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `wabox-vs-docker-${stamp}.json`);
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');

  printSummary(report);
  console.log(`Full report: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
