import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizePath } from '../../src/domain/path-utils.js';
import {
  resolveExecutableOnPath,
  resolveMinimalMirrorPaths,
  resolvePresetToolDirectories,
  resolveWindowsSystemReadonlyPaths,
} from '../../src/policy/resolve-tool-paths.js';
import { buildPolicy } from '../../src/policy/build-policy.js';

describe('resolveExecutableOnPath', () => {
  it('finds node on the host PATH', () => {
    if (process.platform !== 'win32') return;
    expect(resolveExecutableOnPath('node', process.env)).toBeTruthy();
  });
});

describe('resolvePresetToolDirectories', () => {
  it('resolves tool directories or warns on drive-root installs', () => {
    const result = resolvePresetToolDirectories(process.env);
    if (result.toolsFound.includes('node')) {
      expect(result.paths.length).toBeGreaterThan(0);
    } else {
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });
});

describe('resolveMinimalMirrorPaths', () => {
  it('includes Windows system dirs on win32', () => {
    if (process.platform !== 'win32') return;

    const { paths } = resolveMinimalMirrorPaths(process.env);
    const system = resolveWindowsSystemReadonlyPaths(process.env);
    const normalizedPaths = paths.map(normalizePath);
    for (const p of system) {
      expect(normalizedPaths).toContain(normalizePath(p));
    }
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
