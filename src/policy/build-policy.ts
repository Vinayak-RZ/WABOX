import {
  getAvailableToolsPolicy,
  getTemporaryFilesPolicy,
} from '@microsoft/mxc-sdk';
import type { MirroredEnvInfo, PresetName, ResolvedPolicy, WaboxPolicy } from '../domain/types.js';
import { expandWorkspaceDenials, unionPaths } from '../domain/path-utils.js';
import { NODE_DEV_EXPECTED_TOOLS } from '../presets/node-dev.js';
import { getPreset } from '../presets/registry.js';

export interface BuildPolicyInput {
  preset: PresetName;
  overrides?: Partial<WaboxPolicy>;
  mirrorEnv?: boolean;
}

export interface BuildPolicyResult {
  policy: ResolvedPolicy;
  mirroredEnv: MirroredEnvInfo;
}

function mergeWaboxPolicy(base: WaboxPolicy, overrides?: Partial<WaboxPolicy>): WaboxPolicy {
  return {
    timeoutMs: overrides?.timeoutMs ?? base.timeoutMs,
    network: {
      allowOutbound: overrides?.network?.allowOutbound ?? base.network?.allowOutbound ?? false,
    },
    ui: {
      allowWindows: overrides?.ui?.allowWindows ?? base.ui?.allowWindows,
    },
    filesystem: {
      readonlyPaths: unionPaths(base.filesystem?.readonlyPaths, overrides?.filesystem?.readonlyPaths),
      readwritePaths: unionPaths(base.filesystem?.readwritePaths, overrides?.filesystem?.readwritePaths),
      deniedPaths: unionPaths(base.filesystem?.deniedPaths, overrides?.filesystem?.deniedPaths),
      workspacePath: overrides?.filesystem?.workspacePath ?? base.filesystem?.workspacePath,
    },
  };
}

function detectToolsOnPath(env: NodeJS.ProcessEnv): { found: string[]; notFound: string[] } {
  const pathValue = env.PATH ?? env.Path ?? '';
  const segments = pathValue.split(';').map((s) => s.trim().toLowerCase());
  const found: string[] = [];
  const notFound: string[] = [];

  for (const tool of NODE_DEV_EXPECTED_TOOLS) {
    const hit = segments.some((segment) => segment.endsWith(`\\${tool}`) || segment.endsWith(`/${tool}`));
    if (hit) {
      found.push(tool);
    } else {
      notFound.push(tool);
    }
  }

  return { found, notFound };
}

export function buildPolicy(input: BuildPolicyInput): BuildPolicyResult {
  const mirrorEnv = input.mirrorEnv !== false;
  const presetPolicy = getPreset(input.preset);
  let merged = mergeWaboxPolicy(presetPolicy, input.overrides);

  const mirroredPathsAdded: string[] = [];

  if (mirrorEnv) {
    const tools = getAvailableToolsPolicy(process.env);
    const before = merged.filesystem?.readonlyPaths?.length ?? 0;
    merged = {
      ...merged,
      filesystem: {
        ...merged.filesystem,
        readonlyPaths: unionPaths(merged.filesystem?.readonlyPaths, tools.readonlyPaths),
      },
    };
    const after = merged.filesystem?.readonlyPaths?.length ?? 0;
    if (after > before) {
      mirroredPathsAdded.push(...(tools.readonlyPaths ?? []));
    }
  }

  const temp = getTemporaryFilesPolicy();
  merged = {
    ...merged,
    filesystem: {
      ...merged.filesystem,
      readwritePaths: unionPaths(merged.filesystem?.readwritePaths, temp.readwritePaths),
    },
  };

  if (merged.filesystem?.workspacePath) {
    const workspace = merged.filesystem.workspacePath;
    merged = {
      ...merged,
      filesystem: {
        ...merged.filesystem,
        readwritePaths: unionPaths(merged.filesystem.readwritePaths, [workspace]),
        deniedPaths: unionPaths(merged.filesystem.deniedPaths, expandWorkspaceDenials(workspace)),
      },
    };
  }

  const toolDetection = detectToolsOnPath(process.env);

  const policy: ResolvedPolicy = {
    ...merged,
    preset: input.preset,
  };

  return {
    policy,
    mirroredEnv: {
      readonlyPathsAdded: mirroredPathsAdded,
      toolsFound: toolDetection.found,
      toolsNotFound: toolDetection.notFound,
    },
  };
}
