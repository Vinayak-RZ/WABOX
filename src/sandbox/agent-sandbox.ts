import { EventEmitter } from 'node:events';
import type {
  ActionLog,
  ExecOptions,
  ExecResult,
  SessionLog,
} from '../domain/types.js';
import { WaboxError } from '../domain/errors.js';
import { writeSessionLog } from '../infrastructure/session-log-writer.js';
import type { SessionContext } from '../services/session-service.js';
import { ExecOrchestrator } from '../services/exec-orchestrator.js';

export class AgentSandbox extends EventEmitter {
  private readonly orchestrator: ExecOrchestrator;
  private _destroyed = false;

  constructor(private readonly context: SessionContext) {
    super();
    this.orchestrator = new ExecOrchestrator(context.sessionId, context.policy);
  }

  get sessionId(): string {
    return this.context.sessionId;
  }

  get agentId(): string | undefined {
    return this.context.agentId;
  }

  get policy(): SessionContext['policy'] {
    return this.context.policy;
  }

  get mirroredEnv(): SessionContext['mirroredEnv'] {
    return this.context.mirroredEnv;
  }

  get logDir(): string {
    return this.context.logDir;
  }

  get destroyed(): boolean {
    return this._destroyed;
  }

  async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
    if (this._destroyed) {
      throw new WaboxError({
        code: 'SESSION_DESTROYED',
        message: 'Cannot exec on a destroyed session.',
      });
    }
    return this.orchestrator.exec(command, options);
  }

  getActionLog(): ActionLog {
    return this.orchestrator.getActionLog();
  }

  buildSessionLog(endedAt: string): SessionLog {
    const log = this.getActionLog();
    return {
      sessionId: this.context.sessionId,
      agentId: this.context.agentId,
      sessionLabel: this.context.sessionLabel,
      startedAt: this.context.startedAt,
      endedAt,
      preset: this.context.preset,
      policy: this.context.policy,
      mirroredEnv: this.context.mirroredEnv,
      actions: log.actions,
    };
  }

  async destroy(): Promise<SessionLog> {
    if (this._destroyed) {
      throw new WaboxError({
        code: 'SESSION_DESTROYED',
        message: 'Session has already been destroyed.',
      });
    }

    const log = this.buildSessionLog(new Date().toISOString());
    await writeSessionLog(this.logDir, log);
    this._destroyed = true;
    return log;
  }
}
