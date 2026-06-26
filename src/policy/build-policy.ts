import {
  getAvailableToolsPolicy,
  getTemporaryFilesPolicy,
} from '@microsoft/mxc-sdk';
import type { MirrorEnvMode, MirroredEnvInfo, PresetName, ResolvedPolicy, WaboxPolicy } from '../domain/types.js';
import { unionPaths } from '../domain/path-utils.js';
import { sanitizeMirroredReadonlyPaths } from './sanitize-paths.js';
import { execLog } from '../infrastructure/exec-log.js';
import { NODE_DEV_EXPECTED_TOOLS } from '../presets/node-dev.js';
import { getPreset } from '../presets/registry.js';
import { resolvePresetToolDirectories } from './resolve-tool-paths.js';

export interface BuildPolicyInput {
  preset: PresetName;
  overrides?: Partial<WaboxPolicy>;
  mirrorEnv?: MirrorEnvMode;
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

function resolveMirrorMode(mirrorEnv?: MirrorEnvMode): 'full' | 'minimal' | 'none' {
  if (mirrorEnv === 'minimal') return 'minimal';
  if (mirrorEnv === false) return 'none';
  return 'full';
}

function applyReadonlyMirror(
  merged: WaboxPolicy,
  rawPaths: string[],
  mirrorMode: 'full' | 'minimal',
): { merged: WaboxPolicy; kept: string[]; dropped: string[]; added: string[] } {
  const { kept, dropped } = sanitizeMirroredReadonlyPaths(rawPaths);

  if (dropped.length > 0) {
    execLog('mirror:sanitized', {
      droppedCount: dropped.length,
      droppedSample: dropped.slice(0, 5),
      reason: 'Drive roots and overly broad PATH entries slow MXC DACL setup',
    });
  }

  const before = merged.filesystem?.readonlyPaths?.length ?? 0;
  const next: WaboxPolicy = {
    ...merged,
    filesystem: {
      ...merged.filesystem,
      readonlyPaths: unionPaths(merged.filesystem?.readonlyPaths, kept),
    },
  };
  const after = next.filesystem?.readonlyPaths?.length ?? 0;
  const added = after > before ? kept : [];

  execLog('mirror:policy', {
    mirrorMode,
    readonlyPathCount: next.filesystem?.readonlyPaths?.length ?? 0,
    readwritePathCount: next.filesystem?.readwritePaths?.length ?? 0,
  });

  return { merged: next, kept, dropped, added };
}

export function buildPolicy(input: BuildPolicyInput): BuildPolicyResult {
  const mirrorMode = resolveMirrorMode(input.mirrorEnv);
  const presetPolicy = getPreset(input.preset);
  let merged = mergeWaboxPolicy(presetPolicy, input.overrides);

  const mirroredPathsAdded: string[] = [];
  let readonlyPathsDropped: string[] = [];
  let toolsFound: string[] = [];
  let toolsNotFound: string[] = [];

  if (mirrorMode === 'full') {
    const tools = getAvailableToolsPolicy(process.env);
    const applied = applyReadonlyMirror(merged, tools.readonlyPaths ?? [], 'full');
    merged = applied.merged;
    readonlyPathsDropped = applied.dropped;
    mirroredPathsAdded.push(...applied.added);
    const toolDetection = detectToolsOnPath(process.env);
    toolsFound = toolDetection.found;
    toolsNotFound = toolDetection.notFound;
  } else if (mirrorMode === 'minimal') {
    const resolved = resolvePresetToolDirectories(process.env);
    const applied = applyReadonlyMirror(merged, resolved.paths, 'minimal');
    merged = applied.merged;
    readonlyPathsDropped = applied.dropped;
    mirroredPathsAdded.push(...applied.added);
    toolsFound = resolved.toolsFound;
    toolsNotFound = resolved.toolsNotFound;
  } else {
    const toolDetection = detectToolsOnPath(process.env);
    toolsFound = toolDetection.found;
    toolsNotFound = toolDetection.notFound;
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
      },
    };
  }

  const policy: ResolvedPolicy = {
    ...merged,
    preset: input.preset,
  };

  return {
    policy,
    mirroredEnv: {
      mirrorMode,
      readonlyPathsAdded: mirroredPathsAdded,
      readonlyPathsDropped: readonlyPathsDropped.length ? readonlyPathsDropped : undefined,
      toolsFound,
      toolsNotFound,
    },
  };
}
