/** Structured debug logging — enable with WABOX_DEBUG (see getDebugLevel). */

export type DebugLevel = 'off' | 'info' | 'verbose' | 'trace';

const LEVEL_RANK: Record<DebugLevel, number> = {
  off: 0,
  info: 1,
  verbose: 2,
  trace: 3,
};

export function parseDebugLevel(raw?: string): DebugLevel {
  if (!raw?.trim()) return 'off';
  const v = raw.trim().toLowerCase();
  if (v === '0' || v === 'off' || v === 'no' || v === 'false') return 'off';
  if (v === '1' || v === 'true' || v === 'yes' || v === 'info') return 'info';
  if (v === 'verbose' || v === 'v') return 'verbose';
  if (v === 'trace' || v === 'debug' || v === '2') return 'trace';
  return 'off';
}

export function getDebugLevel(env: NodeJS.ProcessEnv = process.env): DebugLevel {
  return parseDebugLevel(env.WABOX_DEBUG);
}

export function isDebugAtLeast(min: DebugLevel, env: NodeJS.ProcessEnv = process.env): boolean {
  return LEVEL_RANK[getDebugLevel(env)] >= LEVEL_RANK[min];
}

export function isDebugJson(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.WABOX_DEBUG_JSON?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function debugLog(
  category: string,
  phase: string,
  detail?: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isDebugAtLeast('info', env)) return;

  const ts = new Date().toISOString();
  const prefix = `[wabox:${category} ${ts}] ${phase}`;

  if (isDebugJson(env)) {
    console.error(
      JSON.stringify({
        ts,
        category,
        phase,
        ...detail,
      }),
    );
    return;
  }

  if (detail) {
    console.error(prefix, detail);
  } else {
    console.error(prefix);
  }
}
