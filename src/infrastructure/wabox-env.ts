import type { AgentSandboxOptions, MirrorEnvMode } from '../domain/types.js';

export interface WaboxEnvConfig {
  mirrorEnv?: MirrorEnvMode;
  workspacePath?: string;
  execTimeoutMs?: number;
  logDir?: string;
  dockerImage?: string;
  benchmarkIterations?: number;
  /** Extra readonly dir for Node/npm when not discoverable via minimal mirror (e.g. D:/nodejs). */
  toolsDir?: string;
}

export function parseMirrorEnv(raw?: string): MirrorEnvMode | undefined {
  if (!raw?.trim()) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === 'minimal') return 'minimal';
  if (value === 'full' || value === 'true' || value === '1' || value === 'yes') return true;
  if (value === 'none' || value === 'false' || value === '0' || value === 'no') return false;
  return undefined;
}

function parsePositiveInt(raw?: string): number | undefined {
  if (!raw?.trim()) return undefined;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Read WABOX_* settings from the environment (after optional dotenv load). */
export function readWaboxEnv(env: NodeJS.ProcessEnv = process.env): WaboxEnvConfig {
  return {
    mirrorEnv: parseMirrorEnv(env.WABOX_MIRROR_ENV),
    workspacePath: env.WABOX_WORKSPACE_PATH?.trim() || undefined,
    execTimeoutMs: parsePositiveInt(env.WABOX_EXEC_TIMEOUT_MS),
    logDir: env.WABOX_LOG_DIR?.trim() || undefined,
    dockerImage: env.WABOX_DOCKER_IMAGE?.trim() || undefined,
    benchmarkIterations: parsePositiveInt(env.WABOX_BENCHMARK_ITERATIONS),
    toolsDir: env.WABOX_TOOLS_DIR?.trim() || undefined,
  };
}
export function mergeAgentSandboxOptions(
  options: AgentSandboxOptions = {},
  env: WaboxEnvConfig = readWaboxEnv(),
): AgentSandboxOptions {
  return {
    ...options,
    logDir: options.logDir ?? env.logDir,
    mirrorEnv: options.mirrorEnv ?? env.mirrorEnv,
    policy: {
      ...options.policy,
      timeoutMs: options.policy?.timeoutMs ?? env.execTimeoutMs,
      filesystem: {
        ...options.policy?.filesystem,
        workspacePath: options.policy?.filesystem?.workspacePath ?? env.workspacePath,
      },
    },
  };
}
