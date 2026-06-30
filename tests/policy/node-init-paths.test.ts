import { describe, expect, it } from 'vitest';
import {
  isExpandNodeMirrorEnabled,
  isNodeViaCmdEnabled,
  resolveNodeInitReadonlyPaths,
} from '../../src/policy/node-init-paths.js';
import { prepareWindowsCommandLine } from '../../src/policy/windows-command.js';

describe('node-init-paths', () => {
  it('isExpandNodeMirrorEnabled reads env', () => {
    expect(isExpandNodeMirrorEnabled({ WABOX_EXPAND_NODE_MIRROR: '1' })).toBe(true);
    expect(isExpandNodeMirrorEnabled({})).toBe(false);
  });

  it('isNodeViaCmdEnabled reads env', () => {
    expect(isNodeViaCmdEnabled({ WABOX_NODE_VIA_CMD: 'true' })).toBe(true);
  });

  it('resolveNodeInitReadonlyPaths includes node install dir on win32', () => {
    if (process.platform !== 'win32') return;
    const paths = resolveNodeInitReadonlyPaths(process.env);
    expect(paths.length).toBeGreaterThan(0);
    const lower = paths.map((p) => p.toLowerCase());
    expect(lower.some((p) => p.includes('nodejs') || p.includes('node'))).toBe(true);
  });
});

describe('prepareWindowsCommandLine node via cmd', () => {
  it('wraps node with cmd /c when WABOX_NODE_VIA_CMD=1', () => {
    if (process.platform !== 'win32') return;
    const env = { ...process.env, WABOX_NODE_VIA_CMD: '1' };
    const prepared = prepareWindowsCommandLine('node -e "console.log(1)"', env);
    expect(prepared).toMatch(/^cmd \/c /);
  });

  it('does not wrap node by default', () => {
    if (process.platform !== 'win32') return;
    const env = { ...process.env };
    delete env.WABOX_NODE_VIA_CMD;
    const prepared = prepareWindowsCommandLine('node -e "console.log(1)"', env);
    expect(prepared).not.toMatch(/^cmd \/c /);
  });
});
