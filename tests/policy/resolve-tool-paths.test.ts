import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolvePresetToolDirectories } from '../../src/policy/resolve-tool-paths.js';
import { buildPolicy } from '../../src/policy/build-policy.js';

describe('resolvePresetToolDirectories', () => {
  it('resolves node directory from PATH containing process.execPath', () => {
    const nodeDir = path.dirname(process.execPath);
    const { paths, toolsFound } = resolvePresetToolDirectories({
      PATH: nodeDir,
    });

    expect(paths).toContain(nodeDir);
    expect(toolsFound).toContain('node');
  });
});

describe('buildPolicy minimal mirror', () => {
  it('adds far fewer readonly paths than full PATH mirror', () => {
    const minimal = buildPolicy({
      preset: 'node-dev',
      mirrorEnv: 'minimal',
      overrides: { filesystem: { workspacePath: process.cwd() } },
    });
    const full = buildPolicy({
      preset: 'node-dev',
      mirrorEnv: true,
      overrides: { filesystem: { workspacePath: process.cwd() } },
    });

    expect(minimal.mirroredEnv.mirrorMode).toBe('minimal');
    expect(minimal.policy.filesystem?.readonlyPaths?.length ?? 0).toBeLessThan(
      full.policy.filesystem?.readonlyPaths?.length ?? 0,
    );
    expect(minimal.mirroredEnv.toolsFound).toContain('node');
  });

  it('workspace-only mirror adds no PATH readonly paths', () => {
    const { policy, mirroredEnv } = buildPolicy({
      preset: 'node-dev',
      mirrorEnv: false,
      overrides: { filesystem: { workspacePath: 'C:\\Dev\\project' } },
    });

    expect(mirroredEnv.mirrorMode).toBe('none');
    expect(policy.filesystem?.readonlyPaths ?? []).toEqual([]);
    expect(policy.filesystem?.readwritePaths).toContain('C:\\Dev\\project');
  });
});
