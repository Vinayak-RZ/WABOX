import type { Action, ActionLog, ResolvedPolicy } from '../domain/types.js';
import { execInMxcSandbox } from '../infrastructure/mxc-adapter.js';
import type { ExecOptions, ExecResult } from '../domain/types.js';

export class ExecOrchestrator {
  private nextActionId = 1;
  private readonly actions: Action[] = [];

  constructor(
    private readonly sessionId: string,
    private readonly policy: ResolvedPolicy,
  ) {}

  getActionLog(): ActionLog {
    return {
      sessionId: this.sessionId,
      actions: [...this.actions],
    };
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const started = Date.now();
    const actionId = this.nextActionId++;
    const timestamp = new Date().toISOString();

    const mxcResult = await execInMxcSandbox(this.policy, command, {
      cwd: options.cwd,
      env: options.env,
      timeoutMs: options.timeoutMs ?? this.policy.timeoutMs,
    });

    const action: Action = {
      id: actionId,
      sessionId: this.sessionId,
      timestamp,
      label: options.label,
      command,
      cwd: options.cwd,
      exitCode: mxcResult.exitCode,
      durationMs: Date.now() - started,
      stdout: mxcResult.stdout,
      stderr: mxcResult.stderr,
    };

    this.actions.push(action);

    return {
      exitCode: action.exitCode,
      stdout: action.stdout,
      stderr: action.stderr,
      durationMs: action.durationMs,
      actionId: action.id,
    };
  }
}
