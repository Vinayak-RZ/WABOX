import fs from 'node:fs';
import path from 'node:path';
import { NODE_DEV_PRESET_TOOLS } from '../infrastructure/mxc-constants.js';
import { unionPaths } from '../domain/path-utils.js';

const WINDOWS_TOOL_EXTENSIONS = ['.exe', '.cmd', '.bat', ''] as const;

function pathSegments(env: NodeJS.ProcessEnv): string[] {
  const raw = env.PATH ?? env.Path ?? '';
  return raw
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function toolExistsInDirectory(directory: string, tool: string): boolean {
  for (const ext of WINDOWS_TOOL_EXTENSIONS) {
    const candidate = path.join(directory, `${tool}${ext}`);
    try {
      if (fs.existsSync(candidate)) return true;
    } catch {
      // ignore unreadable paths
    }
  }
  return false;
}

export interface ResolvedToolPaths {
  /** Parent directories of discovered preset tools (deduped). */
  paths: string[];
  toolsFound: string[];
  toolsNotFound: string[];
}

/**
 * Resolve only directories that contain node-dev preset tools (node, npm, …)
 * instead of mirroring every PATH entry. Cuts MXC DACL work from dozens of paths to a few.
 */
export function resolvePresetToolDirectories(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedToolPaths {
  const segments = pathSegments(env);
  const paths: string[] = [];
  const toolsFound: string[] = [];
  const toolsNotFound: string[] = [];

  for (const tool of NODE_DEV_PRESET_TOOLS) {
    let hit: string | undefined;

    for (const segment of segments) {
      if (toolExistsInDirectory(segment, tool)) {
        hit = segment;
        break;
      }
    }

    if (hit) {
      toolsFound.push(tool);
      paths.push(hit);
    } else {
      toolsNotFound.push(tool);
    }
  }

  return {
    paths: unionPaths(paths),
    toolsFound,
    toolsNotFound,
  };
}
