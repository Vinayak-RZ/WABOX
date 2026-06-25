/**
 * Phase 0 spike — verify MXC works on this host before building WABOX abstractions.
 * Run: npm run spike
 */
import {
  createConfigFromPolicy,
  getAvailableToolsPolicy,
  getPlatformSupport,
  getTemporaryFilesPolicy,
  spawnSandboxFromConfig,
} from '@microsoft/mxc-sdk';
import type { ChildProcess } from 'node:child_process';

const SCHEMA_VERSION = '0.7.0-alpha';
const SPIKE_TIMEOUT_MS = 45_000;

function formatExitCode(code: number | null): string {
  if (code === null) return 'null';
  const unsigned = code >>> 0;
  return `${code} (0x${unsigned.toString(16).toUpperCase()})`;
}

function execInSandbox(commandLine: string, allowWindows = false): Promise<number> {
  const tools = getAvailableToolsPolicy(process.env);
  const temp = getTemporaryFilesPolicy();

  const config = createConfigFromPolicy(
    {
      version: SCHEMA_VERSION,
      filesystem: {
        readonlyPaths: tools.readonlyPaths,
        readwritePaths: temp.readwritePaths,
      },
      network: { allowOutbound: false },
      ui: { allowWindows },
      timeoutMs: 30_000,
    },
    'process',
  );
  config.process!.commandLine = commandLine;

  return new Promise((resolve, reject) => {
    const child = spawnSandboxFromConfig(config, { usePty: false }) as ChildProcess;
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(() => {
        reject(new Error(`timed out after ${SPIKE_TIMEOUT_MS}ms\nstdout: ${stdout}\nstderr: ${stderr}`));
      });
    }, SPIKE_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err) => finish(() => reject(err)));
    child.stdin?.end();
    child.on('close', (code) => {
      finish(() => {
        if (code !== 0) {
          reject(
            new Error(
              `exit ${formatExitCode(code)}\nstdout: ${stdout}\nstderr: ${stderr}`,
            ),
          );
          return;
        }
        process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        resolve(code ?? 0);
      });
    });
  });
}

async function main(): Promise<void> {
  const support = getPlatformSupport();
  console.log('Platform support:', JSON.stringify(support, null, 2));

  if (!support.isSupported) {
    console.error('MXC is not supported on this host.');
    process.exit(1);
  }

  if (support.isolationWarnings?.length) {
    console.warn('\nIsolation warnings:');
    for (const warning of support.isolationWarnings) {
      console.warn(`  - ${warning}`);
    }
    console.warn(
      '\nIf spike fails or hangs, run elevated: wxc-host-prep prepare-system-drive\n',
    );
  }

  const tools = getAvailableToolsPolicy(process.env);
  const temp = getTemporaryFilesPolicy();
  console.log(`Tools readonly paths: ${tools.readonlyPaths.length}`);
  console.log(`Temp readwrite paths: ${temp.readwritePaths.length}`);

  console.log('\n--- node spike ---');
  await execInSandbox('node -e "console.log(\'wabox-ok\')"');

  console.log('\n--- PowerShell spike ---');
  await execInSandbox(
    'powershell.exe -NoProfile -Command "Write-Output wabox-ps-ok"',
    true,
  );

  console.log('\nSpike passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
