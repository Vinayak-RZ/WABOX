import { createConfigFromPolicy, spawnSandboxFromConfig } from '@microsoft/mxc-sdk';
import type { SandboxPolicy } from '@microsoft/mxc-sdk';
import type { ChildProcess } from 'node:child_process';
import { WaboxError } from '../domain/errors.js';
import { toMxcPolicy } from '../policy/to-mxc-policy.js';
import { prepareWindowsCommandLine, quoteWindowsCommandLine } from '../policy/windows-command.js';
import type { WaboxPolicy } from '../domain/types.js';
import { isDebugAtLeast } from './debug.js';
import {
  execLog,
  isExecDebugEnabled,
  isExecTraceEnabled,
  policyLog,
} from './exec-log.js';
import { runHostPrepReport, suggestSpawnHangFix } from './host-prep-check.js';

export { quoteWindowsCommandLine } from '../policy/windows-command.js';

export interface MxcExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface MxcExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function envRecordToMxcEnv(env?: Record<string, string>): string[] | undefined {
  if (!env || Object.keys(env).length === 0) return undefined;
  return Object.entries(env).map(([key, value]) => `${key}=${value}`);
}

function logPolicySnapshot(policy: WaboxPolicy, mxcPolicy: SandboxPolicy): void {
  policyLog('resolved', {
    readonlyPaths: policy.filesystem?.readonlyPaths ?? [],
    readwritePaths: policy.filesystem?.readwritePaths ?? [],
    deniedPaths: policy.filesystem?.deniedPaths ?? [],
    workspacePath: policy.filesystem?.workspacePath,
    allowOutbound: policy.network?.allowOutbound ?? false,
    allowWindows: mxcPolicy.ui?.allowWindows,
    timeoutMs: policy.timeoutMs,
  });
}

export async function execInMxcSandbox(
  policy: WaboxPolicy,
  command: string,
  options: MxcExecOptions = {},
): Promise<MxcExecResult> {
  const startedAt = Date.now();
  const mxcPolicy: SandboxPolicy = toMxcPolicy({ policy, command });
  const timeoutMs = options.timeoutMs ?? policy.timeoutMs ?? 120_000;
  const preparedCommand = prepareWindowsCommandLine(command);
  const quotedCommand = quoteWindowsCommandLine(preparedCommand);

  execLog('begin', {
    command,
    preparedCommand: preparedCommand !== command ? preparedCommand : undefined,
    quotedCommand,
    timeoutMs,
    readonlyPathCount: policy.filesystem?.readonlyPaths?.length ?? 0,
    readwritePathCount: policy.filesystem?.readwritePaths?.length ?? 0,
    deniedPathCount: policy.filesystem?.deniedPaths?.length ?? 0,
  });

  if (isDebugAtLeast('verbose')) {
    logPolicySnapshot(policy, mxcPolicy);
  }

  let driveAceOk: Map<string, boolean> | undefined;
  if (isExecDebugEnabled()) {
    void runHostPrepReport(policy).then((report) => {
      driveAceOk = new Map(report.drives.map((d) => [d.driveRoot, d.ok]));
      execLog('host-prep', {
        drives: report.drives.map((d) => ({
          drive: d.driveRoot,
          ok: d.ok,
          aceCount: d.appContainerAceCount,
          error: d.error,
        })),
        nullDeviceOk: report.nullDevice.ok,
        nullDeviceExitCode: report.nullDevice.exitCode,
        recommendations: report.recommendations,
      });
    });
  }

  const config = createConfigFromPolicy(mxcPolicy, 'process');
  config.process!.commandLine = quotedCommand;
  if (options.cwd) {
    config.process!.cwd = options.cwd;
  }
  const envStrings = envRecordToMxcEnv(options.env);
  if (envStrings) {
    config.process!.env = envStrings;
  }
  if (timeoutMs > 0) {
    config.process!.timeout = timeoutMs;
  }

  if (isDebugAtLeast('verbose')) {
    execLog('mxc-config', {
      containment: config.containment,
      commandLine: config.process?.commandLine,
      cwd: config.process?.cwd,
      processTimeout: config.process?.timeout,
      envVarCount: config.process?.env?.length ?? 0,
    });
  }

  execLog('spawn:starting', {
    note: 'Launching wxc-exec.exe — first spawn after reboot on D: paths may take minutes with no output',
  });

  return new Promise<MxcExecResult>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnSandboxFromConfig(config, { usePty: false }, options.cwd) as ChildProcess;
      execLog('spawn:pid', { pid: child.pid ?? 'unknown' });
    } catch (error) {
      execLog('spawn:failed', { error: error instanceof Error ? error.message : String(error) });
      reject(
        new WaboxError({
          code: 'SANDBOX_SPAWN_FAILED',
          message: error instanceof Error ? error.message : String(error),
          details: error,
        }),
      );
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;
    let firstOutputAt: number | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    if (isExecDebugEnabled()) {
      heartbeat = setInterval(() => {
        const elapsedMs = Date.now() - startedAt;
        execLog('spawn:waiting', {
          elapsedMs,
          stdoutBytes: stdout.length,
          stderrBytes: stderr.length,
          hint: suggestSpawnHangFix({
            elapsedMs,
            stdoutBytes: stdout.length,
            stderrBytes: stderr.length,
            policy,
            driveAceOk,
          }),
        });
      }, 10_000);
    }

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (heartbeat) clearInterval(heartbeat);
      handler();
    };

    const timer = setTimeout(() => {
      const elapsedMs = Date.now() - startedAt;
      execLog('spawn:timeout', {
        timeoutMs,
        elapsedMs,
        stdoutPreview: stdout.slice(0, 200),
        stderrPreview: stderr.slice(0, 500),
        hint: suggestSpawnHangFix({
          elapsedMs,
          stdoutBytes: stdout.length,
          stderrBytes: stderr.length,
          policy,
          driveAceOk,
        }),
      });
      child.kill();
      finish(() => {
        reject(
          new WaboxError({
            code: 'EXEC_TIMEOUT',
            message: `Command timed out after ${timeoutMs}ms`,
            details: {
              command,
              timeoutMs,
              elapsedMs,
              stderrTail: stderr.slice(-1000),
              recommendations: suggestSpawnHangFix({
                elapsedMs,
                stdoutBytes: stdout.length,
                stderrBytes: stderr.length,
                policy,
                driveAceOk,
              }),
            },
          }),
        );
      });
    }, timeoutMs + 5_000);

    child.stdin?.end();

    child.stdout?.on('data', (chunk: Buffer) => {
      if (firstOutputAt === undefined) {
        firstOutputAt = Date.now() - startedAt;
        execLog('spawn:first_stdout', { afterMs: firstOutputAt });
      }
      const text = chunk.toString();
      stdout += text;
      if (isExecTraceEnabled()) {
        process.stderr.write(`[wabox:stdout] ${text}`);
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (firstOutputAt === undefined) {
        firstOutputAt = Date.now() - startedAt;
        execLog('spawn:first_stderr', { afterMs: firstOutputAt });
      }
      const text = chunk.toString();
      stderr += text;
      if (isExecTraceEnabled()) {
        process.stderr.write(`[wabox:stderr] ${text}`);
      }
    });

    child.on('error', (error) => {
      execLog('spawn:error', { message: error.message });
      finish(() => {
        reject(
          new WaboxError({
            code: 'SANDBOX_SPAWN_FAILED',
            message: error.message,
            details: error,
          }),
        );
      });
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startedAt;
      execLog('spawn:close', {
        exitCode: code,
        durationMs,
        stdoutBytes: stdout.length,
        stderrBytes: stderr.length,
        firstOutputMs: firstOutputAt,
      });
      finish(() => {
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
          durationMs,
        });
      });
    });
  });
}
