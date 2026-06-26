import { describe, expect, it } from 'vitest';
import { unionPaths, normalizePath } from '../../src/domain/path-utils.js';
import { buildPolicy } from '../../src/policy/build-policy.js';
import { toMxcPolicy } from '../../src/policy/to-mxc-policy.js';
import { MXC_SCHEMA_VERSION } from '../../src/infrastructure/mxc-constants.js';
import { commandRequiresWindowsUi } from '../../src/policy/shell-detect.js';
import { quoteWindowsCommandLine } from '../../src/policy/windows-command.js';

describe('path-utils', () => {
  it('deduplicates paths case-insensitively on Windows', () => {
    const merged = unionPaths(['C:\\Tools', 'c:/tools'], ['C:\\Tools\\node']);
    expect(merged).toEqual(['C:\\Tools', 'C:\\Tools\\node']);
  });

  it('normalizes slashes for comparison', () => {
    expect(normalizePath('C:/Foo/Bar/')).toBe('c:\\foo\\bar');
  });
});

describe('buildPolicy', () => {
  it('merges workspacePath into readwrite paths', () => {
    const { policy } = buildPolicy({
      preset: 'node-dev',
      mirrorEnv: false,
      overrides: {
        filesystem: {
          workspacePath: 'C:\\Dev\\project',
        },
      },
    });

    expect(policy.filesystem?.readwritePaths).toContain('C:\\Dev\\project');
  });

  it('uses node-dev defaults', () => {
    const { policy } = buildPolicy({
      preset: 'node-dev',
      mirrorEnv: false,
    });

    expect(policy.preset).toBe('node-dev');
    expect(policy.timeoutMs).toBe(120_000);
    expect(policy.network?.allowOutbound).toBe(false);
  });
});

describe('toMxcPolicy', () => {
  it('pins MXC schema version', () => {
    const mxc = toMxcPolicy({
      command: 'node -v',
      policy: { timeoutMs: 1000 },
    });
    expect(mxc.version).toBe(MXC_SCHEMA_VERSION);
  });

  it('enables allowWindows for PowerShell commands', () => {
    const mxc = toMxcPolicy({
      command: 'powershell.exe -NoProfile -Command "Get-Date"',
      policy: {},
    });
    expect(mxc.ui?.allowWindows).toBe(true);
  });
});

describe('shell-detect', () => {
  it('detects powershell and pwsh', () => {
    expect(commandRequiresWindowsUi('powershell.exe -c 1')).toBe(true);
    expect(commandRequiresWindowsUi('pwsh -c 1')).toBe(true);
    expect(commandRequiresWindowsUi('node -e 1')).toBe(false);
  });
});

describe('quoteWindowsCommandLine', () => {
  it('quotes executables with spaces', () => {
    expect(quoteWindowsCommandLine('C:\\Program Files\\nodejs\\node.exe -v')).toBe(
      '"C:\\Program Files\\nodejs\\node.exe" -v',
    );
  });

  it('leaves already quoted commands unchanged', () => {
    const cmd = '"C:\\Program Files\\nodejs\\node.exe" -v';
    expect(quoteWindowsCommandLine(cmd)).toBe(cmd);
  });
});
