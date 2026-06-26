import { describe, expect, it } from 'vitest';
import { isOverlyBroadFilesystemPath, sanitizeMirroredReadonlyPaths } from '../../src/policy/sanitize-paths.js';

describe('sanitize-paths', () => {
  it('drops bare drive roots', () => {
    const { kept, dropped } = sanitizeMirroredReadonlyPaths([
      'C:\\Program Files\\nodejs',
      'D:\\',
      'D:',
      'E:/',
    ]);
    expect(kept).toEqual(['C:\\Program Files\\nodejs']);
    expect(dropped).toEqual(['D:\\', 'D:', 'E:/']);
  });

  it('identifies drive roots', () => {
    expect(isOverlyBroadFilesystemPath('D:\\')).toBe(true);
    expect(isOverlyBroadFilesystemPath('C:\\Users\\Dev')).toBe(false);
  });
});
