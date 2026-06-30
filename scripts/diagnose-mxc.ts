/**
 * Step-by-step MXC diagnostic with host-prep checks and JSON report.
 *
 *   npm run diagnose
 *
 * Debug: WABOX_DEBUG=verbose (default for diagnose) | trace | info | off
 * Report: written to .wabox/diagnostics/latest.json (set WABOX_DIAGNOSE_JSON=0 to skip)
 */
import './bootstrap-env.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getAvailableToolsPolicy, getPlatformSupport, getTemporaryFilesPolicy } from '@microsoft/mxc-sdk';
import { buildPolicy } from '../src/policy/build-policy.js';
import { execInMxcSandbox } from '../src/infrastructure/mxc-adapter.js';
import { getSupportStatus } from '../src/infrastructure/platform.js';
import { readWaboxEnv, mergeAgentSandboxOptions } from '../src/infrastructure/wabox-env.js';
import { runHostPrepReport } from '../src/infrastructure/host-prep-check.js';
import { describeColdStartSituation, resolveExecTimeoutMs } from '../src/infrastructure/exec-timeout.js';
import { isBootWarmed } from '../src/infrastructure/warmup-state.js';
import { resolveMxcHostPrepPath } from '../src/infrastructure/mxc-bin-path.js';
import { sanitizeMirroredReadonlyPaths } from '../src/policy/sanitize-paths.js';
import { isWaboxError } from '../src/domain/errors.js';

if (!process.env.WABOX_DEBUG?.trim()) {
  process.env.WABOX_DEBUG = 'verbose';
}

const DIAGNOSTIC_COMMANDS = [
  { step: 'exec-cmd', label: 'cmd /c echo', command: 'cmd /c echo diagnose-ok', expectStdout: 'diagnose-ok' },
  { step: 'exec-node', label: 'node -e', command: 'node -e "console.log(42)"', expectStdout: '42' },
  { step: 'exec-npm', label: 'npm --version', command: 'npm --version', expectStdout: undefined },
] as const;

type ExecTestStatus = 'pass' | 'fail' | 'error';

interface ExecTestResult {
  step: string;
  label: string;
  command: string;
  status: ExecTestStatus;
  durationMs?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

interface DiagnosticReport {
  runAt: string;
  cwd: string;
  nodeExecPath: string;
  hostPrep: Awaited<ReturnType<typeof runHostPrepReport>>;
  hostPrepBinary: string;
  platform: ReturnType<typeof getPlatformSupport>;
  supportStatus: ReturnType<typeof getSupportStatus>;
  waboxEnv: ReturnType<typeof readWaboxEnv>;
  pathMirror: {
    mxcReported: number;
    kept: number;
    dropped: string[];
  };
  policy: {
    mirrorMode?: string;
    readonlyPaths: string[];
    readwritePaths: string[];
    deniedPaths: string[];
    toolsFound: string[];
    toolsNotFound: string[];
    warnings?: string[];
    tempDirs: string[];
    timeoutMs: number;
  };
  execTests: ExecTestResult[];
  summary: {
    passed: boolean;
    failedStep?: string;
    recommendations: string[];
  };
}

function statusIcon(ok: boolean): string {
  return ok ? '✓' : '✗';
}

function printSection(title: string): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 58 - title.length))}`);
}

async function writeReport(report: DiagnosticReport): Promise<string | undefined> {
  const skip = process.env.WABOX_DIAGNOSE_JSON?.trim().toLowerCase() === '0';
  if (skip) return undefined;

  const dir = path.join(process.cwd(), '.wabox', 'diagnostics');
  await fs.mkdir(dir, { recursive: true });
  const latest = path.join(dir, 'latest.json');
  const stamped = path.join(dir, `diagnostic-${report.runAt.replace(/[:.]/g, '-')}.json`);
  const body = JSON.stringify(report, null, 2);
  await fs.writeFile(latest, body, 'utf8');
  await fs.writeFile(stamped, body, 'utf8');
  return latest;
}

async function main(): Promise<void> {
  console.log('=== WABOX Diagnostic ===');
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log(`CWD: ${process.cwd()}`);
  console.log(`Node: ${process.version} (${process.execPath})`);
  console.log(`WABOX_DEBUG: ${process.env.WABOX_DEBUG ?? 'off'}`);

  const waboxEnv = readWaboxEnv();
  const merged = mergeAgentSandboxOptions({
    preset: 'node-dev',
    policy: { filesystem: { workspacePath: waboxEnv.workspacePath ?? process.cwd() } },
  });

  const { policy, mirroredEnv } = buildPolicy({
    preset: 'node-dev',
    mirrorEnv: merged.mirrorEnv,
    overrides: merged.policy,
  });

  const timeoutMs = resolveExecTimeoutMs(policy, { env: waboxEnv });
  const coldNote = describeColdStartSituation(policy);

  printSection('1. Host preparation');
  const hostPrep = await runHostPrepReport(policy);
  console.log(`   wxc-host-prep: ${resolveMxcHostPrepPath()}`);

  for (const drive of hostPrep.drives) {
    if (drive.skipped) {
      console.log(`   ${drive.driveRoot} ACE check: skipped (${drive.error})`);
      continue;
    }
    const ok = drive.ok;
    console.log(
      `   ${statusIcon(ok)} ${drive.driveRoot} AppContainer ACEs: ${ok ? 'OK' : 'MISSING'} (count=${drive.appContainerAceCount})`,
    );
    if (!ok) {
      console.log(
        `      fix: wxc-host-prep prepare-system-drive --target ${drive.driveRoot}`,
      );
    }
    if (drive.error) console.log(`      error: ${drive.error}`);
  }

  const nd = hostPrep.nullDevice;
  if (nd.skipped) {
    console.log(`   Null device: skipped (${nd.error})`);
  } else {
    console.log(
      `   ${statusIcon(nd.ok)} Null device (\\Device\\Null): ${nd.ok ? 'OK' : 'DRIFT'} (exit=${nd.exitCode})`,
    );
    if (!nd.ok) console.log('      fix: wxc-host-prep prepare-null-device (elevated, once per reboot)');
  }

  if (hostPrep.recommendations.length) {
    console.log('\n   Recommendations:');
    for (const r of hostPrep.recommendations) console.log(`   • ${r}`);
  }

  printSection('2. Platform / MXC');
  const platform = getPlatformSupport();
  const supportStatus = getSupportStatus();
  console.log(JSON.stringify(platform, null, 2).split('\n').map((l) => `   ${l}`).join('\n'));

  if (platform.isolationWarnings?.length) {
    console.log('\n   Isolation warnings:');
    for (const w of platform.isolationWarnings) console.log(`   • ${w}`);
  }

  printSection('3. Environment');
  console.log(`   WABOX_MIRROR_ENV: ${waboxEnv.mirrorEnv ?? '(default full)'}`);
  console.log(`   WABOX_WORKSPACE_PATH: ${waboxEnv.workspacePath ?? '(cwd)'}`);
  console.log(`   WABOX_EXEC_TIMEOUT_MS: ${waboxEnv.execTimeoutMs ?? '(default)'}`);
  console.log(`   WABOX_COLD_START_TIMEOUT_MS: ${process.env.WABOX_COLD_START_TIMEOUT_MS ?? '900000 (default)'}`);
  console.log(`   resolved exec timeout: ${timeoutMs}ms`);
  console.log(`   WABOX_TOOLS_DIR: ${waboxEnv.toolsDir ?? '(unset)'}`);
  console.log(`   SystemDrive: ${process.env.SystemDrive ?? 'C:'}`);

  printSection('4. Policy (resolved)');
  const tools = getAvailableToolsPolicy(process.env);
  const { kept, dropped } = sanitizeMirroredReadonlyPaths(tools.readonlyPaths ?? []);
  console.log(`   mirror mode: ${mirroredEnv.mirrorMode ?? 'full'}`);
  console.log(`   PATH discovery: ${tools.readonlyPaths?.length ?? 0} reported → ${kept.length} kept, ${dropped.length} dropped`);
  if (dropped.length) console.log(`   dropped PATH entries: ${dropped.join('; ')}`);

  const ro = policy.filesystem?.readonlyPaths ?? [];
  const rw = policy.filesystem?.readwritePaths ?? [];
  const denied = policy.filesystem?.deniedPaths ?? [];
  console.log(`   readonly (${ro.length}):`);
  for (const p of ro) console.log(`     - ${p}`);
  console.log(`   readwrite (${rw.length}):`);
  for (const p of rw) console.log(`     - ${p}`);
  if (denied.length) {
    console.log(`   denied (${denied.length}):`);
    for (const p of denied) console.log(`     - ${p}`);
  }
  console.log(`   tools found: ${mirroredEnv.toolsFound.join(', ') || '(none)'}`);
  if (mirroredEnv.toolsNotFound.length) {
    console.log(`   tools not found: ${mirroredEnv.toolsNotFound.join(', ')}`);
  }
  if (mirroredEnv.warnings?.length) {
    console.log('   mirror warnings:');
    for (const w of mirroredEnv.warnings) console.log(`     • ${w}`);
  }
  const temp = getTemporaryFilesPolicy();
  console.log(`   temp dirs: ${temp.readwritePaths?.join('; ') ?? '(none)'}`);

  printSection('5. Sandbox exec tests');
  console.log(`   timeout per test: ${timeoutMs}ms (${Math.round(timeoutMs / 60_000)} min)`);
  if (isBootWarmed()) {
    console.log('   boot warmup: ✓ already warmed this session');
  } else if (coldNote) {
    console.log(`   boot warmup: ✗ not warmed — ${coldNote}`);
    console.log('   tip: run "npm run warmup" once per reboot before diagnose');
  }
  console.log('   (WABOX_DEBUG=trace streams live stdout/stderr)\n');

  const execTests: ExecTestResult[] = [];
  let failedStep: string | undefined;

  for (let i = 0; i < DIAGNOSTIC_COMMANDS.length; i++) {
    const test = DIAGNOSTIC_COMMANDS[i]!;
    const stepNum = i + 1;
    console.log(`   [${stepNum}/${DIAGNOSTIC_COMMANDS.length}] ${test.label}`);
    console.log(`       command: ${test.command}`);

    const started = Date.now();
    try {
      const result = await execInMxcSandbox(policy, test.command, { timeoutMs });
      const durationMs = result.durationMs ?? Date.now() - started;
      const stdout = result.stdout.trim();
      const stderr = result.stderr.trim();

      let status: ExecTestStatus = 'pass';
      let error: string | undefined;

      if (result.exitCode !== 0) {
        status = 'fail';
        error = `exit code ${result.exitCode}`;
      } else if (test.expectStdout !== undefined && !result.stdout.includes(test.expectStdout)) {
        status = 'fail';
        error = `stdout missing "${test.expectStdout}"`;
      } else if (test.expectStdout === undefined && !stdout) {
        status = 'fail';
        error = 'empty stdout';
      }

      console.log(
        `       ${statusIcon(status === 'pass')} ${status.toUpperCase()} in ${durationMs}ms (exit=${result.exitCode})`,
      );
      if (stdout) console.log(`       stdout: ${stdout.slice(0, 200)}`);
      if (result.stderr) {
        console.log(`       stderr: ${result.stderr.slice(-500)}`);
      }
      if (error) console.log(`       reason: ${error}`);

      execTests.push({
        step: test.step,
        label: test.label,
        command: test.command,
        status,
        durationMs,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        error,
      });

      if (status !== 'pass') {
        failedStep = test.step;
        break;
      }
    } catch (err) {
      const durationMs = Date.now() - started;
      const message = isWaboxError(err)
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
      const details = isWaboxError(err) ? err.details : undefined;
      console.log(`       ✗ ERROR in ${durationMs}ms`);
      console.log(`       ${message}`);
      if (details && typeof details === 'object' && 'recommendations' in details) {
        console.log(`       hint: ${String((details as { recommendations?: string }).recommendations)}`);
      }

      execTests.push({
        step: test.step,
        label: test.label,
        command: test.command,
        status: 'error',
        durationMs,
        error: message,
      });
      failedStep = test.step;
      break;
    }
    console.log('');
  }

  const recommendations = [...hostPrep.recommendations];
  if (failedStep) {
    recommendations.push('Run "npm run warmup" once per reboot (D: workspace DACL can take 5–10 min on first spawn).');
    recommendations.push('Re-run with WABOX_DEBUG=trace to stream wxc-exec stdout/stderr live.');
  }

  const report: DiagnosticReport = {
    runAt: new Date().toISOString(),
    cwd: process.cwd(),
    nodeExecPath: process.execPath,
    hostPrep,
    hostPrepBinary: resolveMxcHostPrepPath(),
    platform,
    supportStatus,
    waboxEnv,
    pathMirror: {
      mxcReported: tools.readonlyPaths?.length ?? 0,
      kept: kept.length,
      dropped,
    },
    policy: {
      mirrorMode: mirroredEnv.mirrorMode,
      readonlyPaths: ro,
      readwritePaths: rw,
      deniedPaths: denied,
      toolsFound: mirroredEnv.toolsFound,
      toolsNotFound: mirroredEnv.toolsNotFound,
      warnings: mirroredEnv.warnings,
      tempDirs: temp.readwritePaths ?? [],
      timeoutMs,
    },
    execTests,
    summary: {
      passed: !failedStep,
      failedStep,
      recommendations,
    },
  };

  const reportPath = await writeReport(report);

  printSection('Summary');
  if (report.summary.passed) {
    console.log('   ✓ All checks passed (host prep + cmd + node + npm).');
  } else {
    console.log(`   ✗ Failed at: ${failedStep}`);
    for (const r of recommendations) console.log(`   • ${r}`);
    if (reportPath) console.log(`\n   Full report: ${reportPath}`);
    process.exit(1);
  }

  if (reportPath) console.log(`   Report: ${reportPath}`);
}

main().catch((err) => {
  console.error('\nDiagnostic crashed:', err);
  process.exit(1);
});
