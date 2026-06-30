import fs from 'node:fs';
import path from 'node:path';
import { unionPaths } from '../domain/path-utils.js';
import { isOverlyBroadFilesystemPath } from './sanitize-paths.js';
import { resolveExecutableOnPath } from './resolve-tool-paths.js';

function pushIfValid(paths: string[], raw?: string): void {
  if (!raw?.trim()) return;
  const normalized = path.normalize(raw.trim());
  if (isOverlyBroadFilesystemPath(normalized)) return;
  try {
    if (fs.existsSync(normalized)) {
      paths.push(normalized);
    }
  } catch {
    // ignore
  }
}

/**
 * Extra readonly paths Node may touch during AppContainer startup (beyond tool parent dir).
 * Enable with WABOX_EXPAND_NODE_MIRROR=1 or via probe script.
 */
export function resolveNodeInitReadonlyPaths(env: NodeJS.ProcessEnv = process.env): string[] {
  if (process.platform !== 'win32') return [];

  const paths: string[] = [];
  const nodeExe = resolveExecutableOnPath('node', env);

  if (nodeExe) {
    const installRoot = path.dirname(nodeExe);
    pushIfValid(paths, installRoot);

    const nodeModules = path.join(installRoot, 'node_modules');
    pushIfValid(paths, nodeModules);

    const corepack = path.join(installRoot, 'node_modules', 'corepack');
    pushIfValid(paths, corepack);
  }

  const toolsDir = env.WABOX_TOOLS_DIR?.trim();
  if (toolsDir) {
    pushIfValid(paths, toolsDir);
    pushIfValid(paths, path.join(toolsDir, 'node_modules'));
  }

  // npm config paths only — avoid mirroring entire APPDATA/USERPROFILE (triggers huge DACL walks)
  if (env.APPDATA) {
    pushIfValid(paths, path.join(env.APPDATA, 'npm'));
    pushIfValid(paths, path.join(env.APPDATA, 'npm-cache'));
  }

  const systemRoot = env.SystemRoot ?? env.windir ?? 'C:\\Windows';
  pushIfValid(paths, path.join(systemRoot, 'System32', 'downlevel'));
  pushIfValid(paths, path.join(systemRoot, 'SysWOW64', 'downlevel'));

  return unionPaths(paths);
}

export function isExpandNodeMirrorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.WABOX_EXPAND_NODE_MIRROR?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isNodeViaCmdEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.WABOX_NODE_VIA_CMD?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
