import { createConfigFromPolicy, spawnSandboxFromConfig } from '@microsoft/mxc-sdk';
import type { SandboxPolicy } from '@microsoft/mxc-sdk';
import type { ChildProcess } from 'node:child_process';
import { WaboxError } from '../domain/errors.js';
import { toMxcPolicy } from '../policy/to-mxc-policy.js';
import type { WaboxPolicy } from '../domain/types.js';
import { execLog, isExecDebugEnabled } from './exec-log.js';

export interface MxcExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface MxcExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * MXC rejects unquoted Windows paths containing spaces at parse time.
 * Quote only the leading executable token when needed.
 */
export function quoteWindowsCommandLine(command: string): string {
  const trimmed = command.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return trimmed;
  }

  const winExecutable = /^(.+?\.exe)(\s+.*)?$/i.exec(trimmed);
  if (winExecutable) {
    const executable = winExecutable[1];
    const rest = winExecutable[2] ?? '';
    if (executable.includes(' ')) {
      return `"${executable}"${rest}`;
    }
  }

  return trimmed;
}

function envRecordToMxcEnv(env?: Record<string, string>): string[] | undefined {
  if (!env || Object.keys(env).length === 0) return undefined;
  return Object.entries(env).map(([key, value]) => `${key}=${value}`);
}

export async function execInMxcSandbox(
  policy: WaboxPolicy,
  command: string,
  options: MxcExecOptions = {},
): Promise<MxcExecResult> {
  const startedAt = Date.now();
  const mxcPolicy: SandboxPolicy = toMxcPolicy({ policy, command });
  const timeoutMs = options.timeoutMs ?? policy.timeoutMs ?? 120_000;
  const quotedCommand = quoteWindowsCommandLine(command);

  execLog('begin', {
    command,
    quotedCommand,
    timeoutMs,
    readonlyPaths: policy.filesystem?.readonlyPaths?.length ?? 0,
    readwritePaths: policy.filesystem?.readwritePaths?.length ?? 0,
    deniedPaths: policy.filesystem?.deniedPaths?.length ?? 0,
  });

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

  execLog('spawn:starting', { note: 'Launching wxc-exec.exe — DACL setup may take minutes on first run' });

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
        const elapsed = Date.now() - startedAt;
        execLog('spawn:waiting', {
          elapsedMs: elapsed,
          stdoutBytes: stdout.length,
          stderrBytes: stderr.length,
          hint:
            elapsed > 60_000
              ? 'Still in wxc-exec (DACL recovery?). Try: wxc-host-prep prepare-system-drive (elevated)'
              : 'wxc-exec working…',
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
      execLog('spawn:timeout', {
        timeoutMs,
        elapsedMs: Date.now() - startedAt,
        stdoutPreview: stdout.slice(0, 200),
        stderrPreview: stderr.slice(0, 500),
      });
      child.kill();
      finish(() => {
        reject(
          new WaboxError({
            code: 'EXEC_TIMEOUT',
            message: `Command timed out after ${timeoutMs}ms`,
            details: { command, timeoutMs, stderrTail: stderr.slice(-1000) },
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
      if (isExecDebugEnabled()) {
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
      if (isExecDebugEnabled()) {
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
      execLog('spawn:close', {
        exitCode: code,
        durationMs: Date.now() - startedAt,
        stdoutBytes: stdout.length,
        stderrBytes: stderr.length,
      });
      finish(() => {
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
        });
      });
    });
  });
}
