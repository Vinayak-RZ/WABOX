import path from 'node:path';
import { resolveExecutableOnPath } from './resolve-tool-paths.js';
import { isNodeViaCmdEnabled } from './node-init-paths.js';

/** Windows PATH shims that are `.cmd`/`.bat` — MXC must spawn via `cmd /c`. */
export const WINDOWS_CMD_SHIMS = new Set(['npm', 'npx', 'yarn', 'pnpm']);

/**
 * MXC rejects unquoted Windows paths containing spaces at parse time.
 * Quote only the leading executable token when needed.
 */
export function quoteWindowsCommandLine(command: string): string {
  const trimmed = command.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    return trimmed;
  }

  if (/^cmd(\.exe)?\s+\/c\s+/i.test(trimmed)) {
    return trimmed;
  }

  const leading = /^("(?:[^"]+)"|'(?:[^']+)'|(?:\S+?(?:\s+\S+)*?\.exe))(\s+[\s\S]*)?$/i.exec(trimmed);
  if (!leading) return trimmed;

  let executable = leading[1];
  const rest = leading[2] ?? '';
  if (
    (executable.startsWith('"') && executable.endsWith('"')) ||
    (executable.startsWith("'") && executable.endsWith("'"))
  ) {
    executable = executable.slice(1, -1);
  }

  if (executable.includes(' ')) {
    return `"${executable}"${rest}`;
  }

  return trimmed;
}

function parseLeadingToken(command: string): { executable: string; rest: string } | null {
  const trimmed = command.trim();
  const match = /^("(?:[^"]+)"|'(?:[^']+)'|[^\s]+)([\s\S]*)$/.exec(trimmed);
  if (!match) return null;

  let executable = match[1];
  const rest = match[2] ?? '';
  if (
    (executable.startsWith('"') && executable.endsWith('"')) ||
    (executable.startsWith("'") && executable.endsWith("'"))
  ) {
    executable = executable.slice(1, -1);
  }

  return { executable, rest };
}

function isAlreadyShellWrapped(command: string): boolean {
  return /^(cmd(\.exe)?|powershell(\.exe)?|pwsh(\.exe)?)\b/i.test(command.trim());
}

function toolBaseName(executable: string): string {
  return path.basename(executable).replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
}

/**
 * Rewrite bare tool invocations for MXC CreateProcessW on Windows.
 * Resolves absolute paths for node/npm and wraps cmd shims.
 */
export function prepareWindowsCommandLine(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (process.platform !== 'win32') return command;

  const trimmed = command.trim();
  if (!trimmed || isAlreadyShellWrapped(trimmed)) {
    return trimmed;
  }

  const parsed = parseLeadingToken(trimmed);
  if (!parsed) return trimmed;

  const { executable, rest } = parsed;
  const baseName = toolBaseName(executable);
  const restSuffix = rest.trim() ? ` ${rest.trim()}` : '';

  if (baseName === 'node' || WINDOWS_CMD_SHIMS.has(baseName)) {
    const resolved = resolveExecutableOnPath(baseName, env);
    if (resolved) {
      const resolvedCommand = `${resolved}${restSuffix}`;
      if (WINDOWS_CMD_SHIMS.has(baseName) || (baseName === 'node' && isNodeViaCmdEnabled(env))) {
        return `cmd /c ${quoteWindowsCommandLine(resolvedCommand)}`;
      }
      return quoteWindowsCommandLine(resolvedCommand);
    }
    if (WINDOWS_CMD_SHIMS.has(baseName) || (baseName === 'node' && isNodeViaCmdEnabled(env))) {
      return `cmd /c ${trimmed}`;
    }
  }

  return quoteWindowsCommandLine(trimmed);
}
