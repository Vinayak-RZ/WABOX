import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { NODE_DEV_PRESET_TOOLS } from '../infrastructure/mxc-constants.js';
import { unionPaths } from '../domain/path-utils.js';
import { isOverlyBroadFilesystemPath } from './sanitize-paths.js';

const WINDOWS_TOOL_EXTENSIONS = ['.exe', '.cmd', '.bat', ''] as const;

function pathSegments(env: NodeJS.ProcessEnv): string[] {
  const raw = env.PATH ?? env.Path ?? '';
  return raw
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function parentDirectoryForSandbox(executable: string): string | undefined {
  const dir = path.normalize(path.dirname(executable));
  if (!isOverlyBroadFilesystemPath(dir)) {
    return dir;
  }

  // Permits layouts like D:\nodejs\node.exe — but not bare drive roots (D:\) which break DACL.
  const base = path.basename(executable).toLowerCase();
  if (/^(node|npm|npx|git)\.(exe|cmd|bat)$/.test(base)) {
    return dir;
  }

  return undefined;
}

export function isDriveRootToolInstall(executable: string): boolean {
  return isOverlyBroadFilesystemPath(path.dirname(executable));
}

/** Resolve a tool executable via `where.exe` (Windows) or PATH scan. */
export function resolveExecutableOnPath(
  tool: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const execBase = path.basename(process.execPath).toLowerCase();
  if (tool === 'node' && (execBase === 'node.exe' || execBase === 'node')) {
    if (fs.existsSync(process.execPath)) {
      return process.execPath;
    }
  }

  if (process.platform === 'win32') {
    try {
      const mergedEnv = { ...process.env, ...env };
      const output = execFileSync('where.exe', [tool], {
        encoding: 'utf8',
        env: mergedEnv,
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      for (const line of output.split(/\r?\n/)) {
        const candidate = line.trim();
        if (!candidate) continue;
        try {
          if (fs.existsSync(candidate)) return candidate;
        } catch {
          // ignore
        }
      }
    } catch {
      // where.exe failed — fall back to PATH scan
    }
  }

  for (const segment of pathSegments(env)) {
    for (const ext of WINDOWS_TOOL_EXTENSIONS) {
      const candidate = path.join(segment, `${tool}${ext}`);
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch {
        // ignore
      }
    }
  }

  return undefined;
}

export interface ResolvedToolPaths {
  /** Parent directories of discovered preset tools (deduped). */
  paths: string[];
  toolsFound: string[];
  toolsNotFound: string[];
  warnings: string[];
}

/**
 * Resolve only directories that contain node-dev preset tools (node, npm, …)
 * instead of mirroring every PATH entry. Cuts MXC DACL work from dozens of paths to a few.
 */
export function resolvePresetToolDirectories(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedToolPaths {
  const paths: string[] = [];
  const toolsFound: string[] = [];
  const toolsNotFound: string[] = [];
  const warnings: string[] = [];

  for (const tool of NODE_DEV_PRESET_TOOLS) {
    const executable = resolveExecutableOnPath(tool, env);
    const directory = executable ? parentDirectoryForSandbox(executable) : undefined;

    if (executable && !directory && isDriveRootToolInstall(executable)) {
      warnings.push(
        `${tool} is at ${executable} (drive root). Move tools to a subfolder (e.g. D:\\nodejs) and set WABOX_TOOLS_DIR, or add that folder to PATH.`,
      );
      toolsNotFound.push(tool);
      continue;
    }

    if (directory) {
      toolsFound.push(tool);
      paths.push(directory);
    } else {
      toolsNotFound.push(tool);
    }
  }

  return {
    paths: unionPaths(paths),
    toolsFound,
    toolsNotFound,
    warnings,
  };
}

/** Windows system dirs sandboxed processes need for DLL loading (not full PATH). */
export function resolveWindowsSystemReadonlyPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  if (process.platform !== 'win32') return [];

  const systemRoot = env.SystemRoot ?? env.windir ?? 'C:\\Windows';
  return [path.join(systemRoot, 'System32'), path.join(systemRoot, 'SysWOW64')];
}

/**
 * Preset tool dirs plus Windows system dirs for minimal mirror mode.
 */
export function resolveMinimalMirrorPaths(
  env: NodeJS.ProcessEnv = process.env,
  extraReadonlyPaths: string[] = [],
): ResolvedToolPaths {
  const preset = resolvePresetToolDirectories(env);
  return {
    paths: unionPaths(preset.paths, resolveWindowsSystemReadonlyPaths(env), extraReadonlyPaths),
    toolsFound: preset.toolsFound,
    toolsNotFound: preset.toolsNotFound,
    warnings: preset.warnings,
  };
}
