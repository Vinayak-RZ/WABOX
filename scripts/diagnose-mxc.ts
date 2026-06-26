/**
 * Step-by-step MXC diagnostic — run before benchmark when WABOX appears to hang.
 *
 *   set WABOX_DEBUG=1
 *   npm run diagnose
 */
import { getAvailableToolsPolicy, getPlatformSupport, getTemporaryFilesPolicy } from '@microsoft/mxc-sdk';
import { buildPolicy } from '../src/policy/build-policy.js';
import { execInMxcSandbox } from '../src/infrastructure/mxc-adapter.js';
import { sanitizeMirroredReadonlyPaths } from '../src/policy/sanitize-paths.js';

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

  const { policy, mirroredEnv } = buildPolicy({
    preset: 'node-dev',
    mirrorEnv: true,
    overrides: { filesystem: { workspacePath: process.cwd() } },
  });
  console.log('\n3. Resolved WABOX policy');
  console.log(`   readonly: ${policy.filesystem?.readonlyPaths?.length ?? 0}`);
  console.log(`   readwrite: ${policy.filesystem?.readwritePaths?.length ?? 0}`);
  console.log(`   tools on PATH: ${mirroredEnv.toolsFound.join(', ') || '(none)'}`);
  if (mirroredEnv.readonlyPathsDropped?.length) {
    console.log(`   dropped paths: ${mirroredEnv.readonlyPathsDropped.length}`);
  }

  const temp = getTemporaryFilesPolicy();
  console.log(`   temp dirs: ${temp.readwritePaths?.join(', ')}`);

  console.log('\n4. Test exec (cmd /c echo diagnose-ok)');
  console.log('   Set WABOX_DEBUG=1 to see wxc-exec stderr live.\n');

  const result = await execInMxcSandbox(policy, 'cmd /c echo diagnose-ok', { timeoutMs: 300_000 });
  console.log('\n5. Result');
  console.log(`   exitCode: ${result.exitCode}`);
  console.log(`   stdout: ${result.stdout.trim()}`);
  if (result.stderr) {
    console.log(`   stderr (last 500 chars): ${result.stderr.slice(-500)}`);
  }

  if (result.exitCode !== 0) {
    process.exit(1);
  }
  console.log('\nDiagnostic passed.');
}

main().catch((err) => {
  console.error('\nDiagnostic failed:', err);
  process.exit(1);
});
