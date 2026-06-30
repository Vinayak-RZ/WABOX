import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface WarmupState {
  warmedAt: string;
  /** `os.uptime()` (seconds) when warmup completed — used to detect same boot session. */
  bootUptimeAtWarm: number;
  durationMs: number;
  command: string;
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

/** True when a successful warmup completed earlier in this boot session. */
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

export function markBootWarmed(durationMs: number, command: string, cwd = process.cwd()): void {
  writeWarmupState(
    {
      warmedAt: new Date().toISOString(),
      bootUptimeAtWarm: os.uptime(),
      durationMs,
      command,
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
