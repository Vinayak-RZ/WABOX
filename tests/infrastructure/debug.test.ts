import { describe, expect, it } from 'vitest';
import { parseDebugLevel, getDebugLevel } from '../../src/infrastructure/debug.js';

describe('debug', () => {
  it('parseDebugLevel maps legacy values', () => {
    expect(parseDebugLevel('1')).toBe('info');
    expect(parseDebugLevel('true')).toBe('info');
    expect(parseDebugLevel('verbose')).toBe('verbose');
    expect(parseDebugLevel('trace')).toBe('trace');
    expect(parseDebugLevel('0')).toBe('off');
    expect(parseDebugLevel(undefined)).toBe('off');
  });

  it('getDebugLevel reads WABOX_DEBUG', () => {
    expect(getDebugLevel({ WABOX_DEBUG: 'trace' })).toBe('trace');
  });
});
