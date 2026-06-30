/**
 * One-shot MXC DACL warmup — run once after each reboot when workspace is on D: (or other data drives).
 *
 *   npm run warmup
 *
 * First spawn can take 5–10 minutes with zero output. Subsequent spawns in this boot session
 * are typically ~1–2s. Marks `.wabox/warmup.json` on success.
 */
import './bootstrap-env.js';
import { buildPolicy } from '../src/policy/build-policy.js';
import { execInMxcSandbox } from '../src/infrastructure/mxc-adapter.js';
import { mergeAgentSandboxOptions, readWaboxEnv } from '../src/infrastructure/wabox-env.js';
import { describeColdStartSituation, resolveExecTimeoutMs } from '../src/infrastructure/exec-timeout.js';
import { isBootWarmedForPolicy, readWarmupState, warmupPolicyStatus } from '../src/infrastructure/warmup-state.js';
import { runHostPrepReport } from '../src/infrastructure/host-prep-check.js';

async function main(): Promise<void> {
  console.log('=== WABOX MXC Warmup ===\n');

  const waboxEnv = readWaboxEnv();
  const merged = mergeAgentSandboxOptions({
    preset: 'node-dev',
    policy: { filesystem: { workspacePath: waboxEnv.workspacePath ?? process.cwd() } },
  });

  const { policy } = buildPolicy({
    preset: 'node-dev',
    mirrorEnv: merged.mirrorEnv,
    overrides: merged.policy,
  });

  if (isBootWarmedForPolicy(policy)) {
    const state = readWarmupState();
    console.log(`Already warmed for current policy at ${state?.warmedAt} (${state?.durationMs}ms).`);
    console.log('Subsequent exec() calls should be fast (~1–2s).');
    return;
  }

  const status = warmupPolicyStatus(policy);
  if (status === 'stale') {
    console.log('Policy paths changed since last warmup — re-running DACL warmup.\n');
  }

  const hostPrep = await runHostPrepReport(policy);
  for (const drive of hostPrep.drives) {
    if (!drive.skipped) {
      console.log(
        `Drive ${drive.driveRoot}: AppContainer ACEs ${drive.ok ? 'OK' : 'MISSING'} (${drive.appContainerAceCount})`,
      );
    }
  }
  if (!hostPrep.nullDevice.skipped) {
    console.log(
      `Null device: ${hostPrep.nullDevice.ok ? 'OK' : 'NEEDS prepare-null-device (elevated)'} (exit=${hostPrep.nullDevice.exitCode})`,
    );
  }

  const coldNote = describeColdStartSituation(policy);
  const timeoutMs = resolveExecTimeoutMs(policy, { env: waboxEnv });
  console.log(`\nTimeout: ${timeoutMs}ms (${Math.round(timeoutMs / 60_000)} min)`);
  if (coldNote) console.log(coldNote);
  console.log('\nRunning: cmd /c echo warmup-ok');
  console.log('(No output for several minutes is normal on first spawn after reboot.)\n');

  const started = Date.now();
  const result = await execInMxcSandbox(policy, 'cmd /c echo warmup-ok', { timeoutMs });
  const elapsed = Date.now() - started;

  if (result.exitCode !== 0 || !result.stdout.includes('warmup-ok')) {
    console.error(`Warmup failed: exit=${result.exitCode} stdout=${result.stdout.trim()} stderr=${result.stderr.slice(-500)}`);
    process.exit(1);
  }

  console.log(`\n✓ Warmup OK in ${elapsed}ms`);
  console.log('stdout:', result.stdout.trim());
  console.log('\nRun npm run diagnose or npm run example — should be fast now.');
}

main().catch((err) => {
  console.error('Warmup failed:', err);
  process.exit(1);
});
