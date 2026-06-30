import { describe, expect, it } from 'vitest';
import { resolveSandboxTempPaths } from '../../src/policy/sandbox-temp.js';
import { buildPolicy } from '../../src/policy/build-policy.js';
import fs from 'node:fs';
import path from 'node:path';

describe('sandbox-temp', () => {
  it('uses workspace .wabox/tmp by default', () => {
    const dirs = resolveSandboxTempPaths('D:/proj');
    expect(dirs).toEqual([path.join('D:/proj', '.wabox', 'tmp')]);
    expect(fs.existsSync(dirs[0]!)).toBe(true);
  });

  it('buildPolicy avoids AppData Local Temp when workspace set', () => {
    const { policy } = buildPolicy({
      preset: 'node-dev',
      mirrorEnv: 'minimal',
      overrides: { filesystem: { workspacePath: 'D:/proj' } },
    });
    const rw = policy.filesystem?.readwritePaths ?? [];
    expect(rw.some((p) => p.includes('AppData\\Local\\Temp'))).toBe(false);
    expect(rw.some((p) => p.includes('.wabox\\tmp') || p.includes('.wabox/tmp'))).toBe(true);
  });
});
