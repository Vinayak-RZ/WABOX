import { randomUUID } from 'node:crypto';
import type {
  AgentSandboxOptions,
  MirroredEnvInfo,
  ResolvedPolicy,
} from '../domain/types.js';
import { DEFAULT_SESSION_LOG_DIR } from '../infrastructure/mxc-constants.js';
import { assertPlatformSupported } from '../infrastructure/platform.js';
import { mergeAgentSandboxOptions } from '../infrastructure/wabox-env.js';
import { buildPolicy } from '../policy/build-policy.js';
import { AgentSandbox } from '../sandbox/agent-sandbox.js';

export interface SessionContext {
  sessionId: string;
  agentId?: string;
  sessionLabel?: string;
  startedAt: string;
  preset: 'node-dev';
  policy: ResolvedPolicy;
  mirroredEnv: MirroredEnvInfo;
  logDir: string;
}

export function createSessionContext(options: AgentSandboxOptions): SessionContext {
  assertPlatformSupported();

  const resolved = mergeAgentSandboxOptions(options);
  const preset = resolved.preset ?? 'node-dev';
  const { policy, mirroredEnv } = buildPolicy({
    preset,
    overrides: resolved.policy,
    mirrorEnv: resolved.mirrorEnv,
  });

  return {
    sessionId: `wabox-${randomUUID()}`,
    agentId: resolved.agentId,
    sessionLabel: resolved.sessionLabel,
    startedAt: new Date().toISOString(),
    preset,
    policy,
    mirroredEnv,
    logDir: resolved.logDir ?? DEFAULT_SESSION_LOG_DIR,
  };
}

export function createAgentSandboxInstance(options: AgentSandboxOptions = {}): AgentSandbox {
  const context = createSessionContext(options);
  return new AgentSandbox(context);
}
