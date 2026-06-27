import { describe, expect, it } from 'vitest';
import {
  collectPolicyDriveRoots,
  driveRootFromPath,
  suggestSpawnHangFix,
  uniqueDriveRoots,
} from '../../src/infrastructure/host-prep-check.js';
import type { WaboxPolicy } from '../../src/domain/types.js';

describe('host-prep-check', () => {
  it('driveRootFromPath extracts drive roots', () => {
    expect(driveRootFromPath('D:/Tech/WABOX')).toBe('D:\\');
    expect(driveRootFromPath('C:\\')).toBe('C:\\');
    expect(driveRootFromPath('relative/path')).toBeUndefined();
  });

  it('uniqueDriveRoots deduplicates', () => {
    expect(uniqueDriveRoots(['D:/a', 'D:\\b', 'C:/x'])).toEqual(['C:\\', 'D:\\']);
  });

  it('collectPolicyDriveRoots includes workspace and policy paths', () => {
    const policy: WaboxPolicy = {
      filesystem: {
        workspacePath: 'D:/Tech/WABOX',
        readonlyPaths: ['D:/nodejs'],
        readwritePaths: ['C:/Users/x/AppData/Local/Temp'],
      },
    };
    expect(collectPolicyDriveRoots(policy)).toEqual(['C:\\', 'D:\\']);
  });

  it('suggestSpawnHangFix mentions missing ACEs', () => {
    const policy: WaboxPolicy = {
      filesystem: { readwritePaths: ['D:/Tech/WABOX'] },
    };
    const hint = suggestSpawnHangFix({
      elapsedMs: 120_000,
      stdoutBytes: 0,
      stderrBytes: 0,
      policy,
      driveAceOk: new Map([['D:\\', false]]),
    });
    expect(hint).toContain('prepare-system-drive');
    expect(hint).toContain('D:\\');
  });

  it('suggestSpawnHangFix mentions non-system drive cold start', () => {
    const policy: WaboxPolicy = {
      filesystem: { readwritePaths: ['D:/Tech/WABOX'] },
    };
    const hint = suggestSpawnHangFix({
      elapsedMs: 120_000,
      stdoutBytes: 0,
      stderrBytes: 0,
      policy,
      driveAceOk: new Map([['D:\\', true]]),
    });
    expect(hint).toMatch(/4–10 min|non-system-drive/i);
  });
});
