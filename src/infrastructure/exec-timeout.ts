import type { WaboxPolicy } from '../domain/types.js';
import { collectPolicyDriveRoots } from './host-prep-check.js';
import { isBootWarmedForPolicy } from './warmup-state.js';
import type { WaboxEnvConfig } from './wabox-env.js';

const DEFAULT_COLD_START_TIMEOUT_MS = 900_000; // 15 min — D:\ DACL first spawn can exceed 5 min

export function hasNonSystemDriveInPolicy(policy: WaboxPolicy): boolean {
  const systemDrive = `${process.env.SystemDrive ?? 'C:'}\\`.toUpperCase();
  return collectPolicyDriveRoots(policy).some((d) => d.toUpperCase() !== systemDrive);
}

export function resolveColdStartTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.WABOX_COLD_START_TIMEOUT_MS?.trim();
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_COLD_START_TIMEOUT_MS;
}

/**
 * MXC DACL on non-system-drive paths (e.g. D:\ workspace) can take 5–10 min on first
 * spawn after reboot. Use a longer timeout until boot warmup succeeds once.
 */
export function resolveExecTimeoutMs(
  policy: WaboxPolicy,
  options: { timeoutMs?: number; env?: WaboxEnvConfig; cwd?: string } = {},
): number {
  const envConfig = options.env;
  const base =
    options.timeoutMs ??
    envConfig?.execTimeoutMs ??
    policy.timeoutMs ??
    120_000;

  if (isBootWarmedForPolicy(policy, options.cwd)) {
    return base;
  }

  if (!hasNonSystemDriveInPolicy(policy)) {
    return base;
  }

  const cold = resolveColdStartTimeoutMs();
  return Math.max(base, cold);
}

export function describeColdStartSituation(policy: WaboxPolicy, cwd = process.cwd()): string | undefined {
  if (isBootWarmedForPolicy(policy, cwd)) return undefined;
  if (!hasNonSystemDriveInPolicy(policy)) return undefined;

  const drives = collectPolicyDriveRoots(policy).filter(
    (d) => d.toUpperCase() !== `${process.env.SystemDrive ?? 'C:'}\\`.toUpperCase(),
  );
  const coldSec = Math.round(resolveColdStartTimeoutMs() / 1000);
  return (
    `First MXC spawn this boot on ${drives.join(', ')} may take several minutes with no output ` +
    `(DACL setup). Timeout extended to ${coldSec}s until warmup succeeds. Run: npm run warmup`
  );
}
