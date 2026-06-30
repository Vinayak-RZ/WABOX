import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { WaboxPolicy } from '../domain/types.js';
import { policyFilesystemFingerprint } from '../policy/policy-fingerprint.js';

export interface WarmupState {
  warmedAt: string;
  /** `os.uptime()` (seconds) when warmup completed — used to detect same boot session. */
  bootUptimeAtWarm: number;
  durationMs: number;
  command: string;
  /** Filesystem policy fingerprint when warmup succeeded — invalid if policy paths change. */
  policyFingerprint?: string;
}

const DEFAULT_STATE_PATH = '.wabox/warmup.json';

export function warmupStatePath(cwd = process.cwd()): string {
  const custom = process.env.WABOX_WARMUP_STATE?.trim();
  if (custom) return path.isAbsolute(custom) ? custom : path.join(cwd, custom);
  return path.join(cwd, DEFAULT_STATE_PATH);
}

export function readWarmupState(cwd = process.cwd()): WarmupState | undefined {
  try {
    const raw = fs.readFileSync(warmupStatePath(cwd), 'utf8');
    return JSON.parse(raw) as WarmupState;
  } catch {
    return undefined;
  }
}

/** True when warmup completed this boot for the same filesystem policy fingerprint. */
export function isBootWarmedForPolicy(policy: WaboxPolicy, cwd = process.cwd()): boolean {
  return warmupPolicyStatus(policy, cwd) === 'current';
}

export type WarmupPolicyStatus = 'not-warmed' | 'stale' | 'current';

/** Whether warmup matches this boot session and current filesystem policy paths. */
export function warmupPolicyStatus(policy: WaboxPolicy, cwd = process.cwd()): WarmupPolicyStatus {
  const state = readWarmupState(cwd);
  if (!state) return 'not-warmed';
  if (state.bootUptimeAtWarm > os.uptime()) return 'not-warmed';
  if (!state.policyFingerprint) return 'stale';
  if (state.policyFingerprint !== policyFilesystemFingerprint(policy)) return 'stale';
  return 'current';
}

/** @deprecated Use isBootWarmedForPolicy — boot-only check ignores policy changes. */
export function isBootWarmed(cwd = process.cwd()): boolean {
  const state = readWarmupState(cwd);
  if (!state) return false;
  return state.bootUptimeAtWarm <= os.uptime();
}

export function writeWarmupState(
  state: WarmupState,
  cwd = process.cwd(),
): void {
  const file = warmupStatePath(cwd);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

export function markBootWarmed(
  durationMs: number,
  command: string,
  policy: WaboxPolicy,
  cwd = process.cwd(),
): void {
  writeWarmupState(
    {
      warmedAt: new Date().toISOString(),
      bootUptimeAtWarm: os.uptime(),
      durationMs,
      command,
      policyFingerprint: policyFilesystemFingerprint(policy),
    },
    cwd,
  );
}

export function clearWarmupState(cwd = process.cwd()): void {
  try {
    fs.unlinkSync(warmupStatePath(cwd));
  } catch {
    // ignore
  }
}
