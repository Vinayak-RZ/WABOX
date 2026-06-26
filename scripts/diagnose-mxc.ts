/**
 * Step-by-step MXC diagnostic — run before benchmark when WABOX appears to hang.
 *
 *   npm run diagnose
 *   (configure via .env — WABOX_MIRROR_ENV, WABOX_DEBUG, etc.)
 */
import './bootstrap-env.js';
import { getAvailableToolsPolicy, getPlatformSupport, getTemporaryFilesPolicy } from '@microsoft/mxc-sdk';
import { buildPolicy } from '../src/policy/build-policy.js';
import { execInMxcSandbox } from '../src/infrastructure/mxc-adapter.js';
import type { MxcExecResult } from '../src/infrastructure/mxc-adapter.js';
import { mergeAgentSandboxOptions } from '../src/infrastructure/wabox-env.js';
import { sanitizeMirroredReadonlyPaths } from '../src/policy/sanitize-paths.js';

const DIAGNOSTIC_COMMANDS = [
  { step: 4, label: 'cmd /c echo', command: 'cmd /c echo diagnose-ok', expectStdout: 'diagnose-ok' },
  { step: 5, label: 'node -e', command: 'node -e "console.log(42)"', expectStdout: '42' },
  { step: 6, label: 'npm --version', command: 'npm --version', expectStdout: undefined },
] as const;

function printExecResult(result: MxcExecResult): void {
  console.log(`   exitCode: ${result.exitCode}`);
  const stdout = result.stdout.trim();
  if (stdout) console.log(`   stdout: ${stdout}`);
  if (result.stderr) {
    console.log(`   stderr (last 500 chars): ${result.stderr.slice(-500)}`);
  }
}

async function main(): Promise<void> {
  console.log('=== WABOX MXC Diagnostic ===\n');

  const platform = getPlatformSupport();
  console.log('1. Platform support');
  console.log(JSON.stringify(platform, null, 2));

  if (platform.isolationWarnings?.length) {
    console.log('\n⚠ Isolation warnings:');
    for (const w of platform.isolationWarnings) console.log('  -', w);
  }

  const tools = getAvailableToolsPolicy(process.env);
  const { kept, dropped } = sanitizeMirroredReadonlyPaths(tools.readonlyPaths ?? []);
  console.log('\n2. PATH mirror discovery');
  console.log(`   MXC reported ${tools.readonlyPaths?.length ?? 0} readonly paths`);
  console.log(`   After sanitize: ${kept.length} kept, ${dropped.length} dropped`);
  if (dropped.length) {
    console.log('   Dropped (drive roots / too broad):', dropped);
  }

  const merged = mergeAgentSandboxOptions({
    preset: 'node-dev',
    policy: { filesystem: { workspacePath: process.cwd() } },
  });
  const { policy, mirroredEnv } = buildPolicy({
    preset: 'node-dev',
    mirrorEnv: merged.mirrorEnv,
    overrides: merged.policy,
  });
  console.log('\n3. Resolved WABOX policy');
  console.log(`   mirror mode: ${mirroredEnv.mirrorMode ?? 'full'}`);
  console.log(`   readonly: ${policy.filesystem?.readonlyPaths?.length ?? 0}`);
  if (policy.filesystem?.readonlyPaths?.length) {
    console.log(`   readonly paths: ${policy.filesystem.readonlyPaths.join('; ')}`);
  }
  console.log(`   readwrite: ${policy.filesystem?.readwritePaths?.length ?? 0}`);
  console.log(`   tools on PATH: ${mirroredEnv.toolsFound.join(', ') || '(none)'}`);
  if (mirroredEnv.toolsNotFound.length) {
    console.log(`   tools not found: ${mirroredEnv.toolsNotFound.join(', ')}`);
  }
  if (mirroredEnv.readonlyPathsDropped?.length) {
    console.log(`   dropped paths: ${mirroredEnv.readonlyPathsDropped.length}`);
  }

  if (mirroredEnv.warnings?.length) {
    console.log('\n⚠ Mirror warnings:');
    for (const w of mirroredEnv.warnings) console.log('  -', w);
  }

  const temp = getTemporaryFilesPolicy();
  console.log(`   temp dirs: ${temp.readwritePaths?.join(', ')}`);

  const timeoutMs = merged.policy?.timeoutMs ?? 300_000;
  console.log('\n   Set WABOX_DEBUG=1 to see wxc-exec stderr live.\n');

  for (const test of DIAGNOSTIC_COMMANDS) {
    console.log(`${test.step}. Test exec (${test.label})`);
    console.log(`   command: ${test.command}\n`);

    const result = await execInMxcSandbox(policy, test.command, { timeoutMs });
    console.log(`\n   Result`);
    printExecResult(result);

    if (result.exitCode !== 0) {
      console.error(`\nDiagnostic failed at step ${test.step} (${test.label}).`);
      process.exit(1);
    }

    if (test.expectStdout !== undefined && !result.stdout.includes(test.expectStdout)) {
      console.error(
        `\nDiagnostic failed at step ${test.step}: expected stdout to include "${test.expectStdout}".`,
      );
      process.exit(1);
    }

    if (test.expectStdout === undefined && !result.stdout.trim()) {
      console.error(`\nDiagnostic failed at step ${test.step}: expected non-empty stdout.`);
      process.exit(1);
    }

    console.log('');
  }

  console.log('Diagnostic passed (cmd, node, npm).');
}

main().catch((err) => {
  console.error('\nDiagnostic failed:', err);
  process.exit(1);
});
