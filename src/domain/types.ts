export type PresetName = 'node-dev';

export interface WaboxFilesystemPolicy {
  readonlyPaths?: string[];
  readwritePaths?: string[];
  deniedPaths?: string[];
  /** Grants readwrite to workspace; cwd alone does not grant MXC filesystem access. */
  workspacePath?: string;
}

export interface WaboxPolicy {
  filesystem?: WaboxFilesystemPolicy;
  ui?: {
    allowWindows?: boolean;
  };
  network?: {
    allowOutbound?: boolean;
  };
  timeoutMs?: number;
}

export interface AgentSandboxOptions {
  agentId?: string;
  sessionLabel?: string;
  preset?: PresetName;
  policy?: Partial<WaboxPolicy>;
  mirrorEnv?: boolean;
  logDir?: string;
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  label?: string;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  actionId: number;
}

export interface Action {
  id: number;
  sessionId: string;
  timestamp: string;
  label?: string;
  command: string;
  cwd?: string;
  exitCode: number;
  durationMs: number;
  stdout: string;
  stderr: string;
}

export interface ActionLog {
  sessionId: string;
  actions: Action[];
}

export interface MirroredEnvInfo {
  readonlyPathsAdded: string[];
  /** Paths MXC wanted but WABOX dropped (e.g. drive roots) */
  readonlyPathsDropped?: string[];
  toolsFound: string[];
  toolsNotFound: string[];
}

export interface ResolvedPolicy extends WaboxPolicy {
  preset: PresetName;
}

export interface SessionLog {
  sessionId: string;
  agentId?: string;
  sessionLabel?: string;
  startedAt: string;
  endedAt?: string;
  preset: PresetName;
  policy: ResolvedPolicy;
  mirroredEnv: MirroredEnvInfo;
  actions: Action[];
}

export interface SupportStatus {
  supported: boolean;
  nodeVersion: string;
  platform: string;
  mxcSupported: boolean;
  mxcReason?: string;
  availableBackends: string[];
  isolationTier?: string;
  isolationWarnings?: string[];
  errors: string[];
}
