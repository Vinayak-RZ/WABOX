export { createAgentSandboxInstance as createAgentSandbox } from './services/session-service.js';
export { getSupportStatus } from './infrastructure/platform.js';
export { listPresets } from './presets/registry.js';

export type {
  Action,
  ActionLog,
  AgentSandboxOptions,
  ExecOptions,
  ExecResult,
  MirroredEnvInfo,
  PresetName,
  ResolvedPolicy,
  SessionLog,
  SupportStatus,
  WaboxPolicy,
} from './domain/types.js';

export { WaboxError, isWaboxError } from './domain/errors.js';
export type { AgentSandbox } from './sandbox/agent-sandbox.js';
