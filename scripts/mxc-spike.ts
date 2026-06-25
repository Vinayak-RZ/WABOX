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
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`exit ${code}\nstdout: ${stdout}\nstderr: ${stderr}`));
        return;
      }
      process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
      resolve(code ?? 0);
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
