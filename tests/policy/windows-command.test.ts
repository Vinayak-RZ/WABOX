import { describe, expect, it } from 'vitest';
import {
  prepareWindowsCommandLine,
  quoteWindowsCommandLine,
} from '../../src/policy/windows-command.js';

describe('prepareWindowsCommandLine', () => {
  it('wraps bare npm invocations with cmd /c on Windows', () => {
    const prepared = prepareWindowsCommandLine('npm --version');
    expect(prepared).toMatch(/^cmd \/c /);
    expect(prepared).toContain('npm');
  });

  it('resolves node to an absolute path when available', () => {
    if (process.platform !== 'win32') return;
    const prepared = prepareWindowsCommandLine('node -e "console.log(1)"');
    expect(prepared.toLowerCase()).toMatch(/node(\.exe)? -e/);
  });

  it('leaves cmd /c echo unchanged', () => {
    expect(prepareWindowsCommandLine('cmd /c echo ok')).toBe('cmd /c echo ok');
  });
});

describe('quoteWindowsCommandLine', () => {
  it('does not quote cmd /c chains when node.exe appears in the path', () => {
    expect(quoteWindowsCommandLine('cmd /c D:\\nodejs\\node.exe -e "1"')).toBe(
      'cmd /c D:\\nodejs\\node.exe -e "1"',
    );
  });

  it('quotes executables with spaces', () => {
    expect(quoteWindowsCommandLine('C:\\Program Files\\nodejs\\node.exe -v')).toBe(
      '"C:\\Program Files\\nodejs\\node.exe" -v',
    );
  });
});
