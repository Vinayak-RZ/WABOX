import { createConfigFromPolicy, spawnSandboxFromConfig } from '@microsoft/mxc-sdk';
import type { SandboxPolicy } from '@microsoft/mxc-sdk';
import type { ChildProcess } from 'node:child_process';
import { WaboxError } from '../domain/errors.js';
import { toMxcPolicy } from '../policy/to-mxc-policy.js';
import type { WaboxPolicy } from '../domain/types.js';

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
  const mxcPolicy: SandboxPolicy = toMxcPolicy({ policy, command });
  const timeoutMs = options.timeoutMs ?? policy.timeoutMs ?? 120_000;

  const config = createConfigFromPolicy(mxcPolicy, 'process');
  config.process!.commandLine = quoteWindowsCommandLine(command);
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

  return new Promise<MxcExecResult>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnSandboxFromConfig(config, { usePty: false }, options.cwd) as ChildProcess;
    } catch (error) {
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

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler();
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(() => {
        reject(
          new WaboxError({
            code: 'EXEC_TIMEOUT',
            message: `Command timed out after ${timeoutMs}ms`,
            details: { command, timeoutMs },
          }),
        );
      });
    }, timeoutMs + 5_000);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
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
