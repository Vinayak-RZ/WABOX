import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isBootWarmed, markBootWarmed, clearWarmupState } from '../../src/infrastructure/warmup-state.js';
import {
  hasNonSystemDriveInPolicy,
  resolveExecTimeoutMs,
} from '../../src/infrastructure/exec-timeout.js';
import type { WaboxPolicy } from '../../src/domain/types.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_DIR = path.join(process.cwd(), '.wabox-test-warmup');

describe('warmup-state', () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    process.env.WABOX_WARMUP_STATE = path.join(TEST_DIR, 'warmup.json');
    clearWarmupState(TEST_DIR);
  });

  afterEach(() => {
    delete process.env.WABOX_WARMUP_STATE;
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('isBootWarmed is false until markBootWarmed', () => {
    expect(isBootWarmed(TEST_DIR)).toBe(false);
    markBootWarmed(1000, 'cmd /c echo', TEST_DIR);
    expect(isBootWarmed(TEST_DIR)).toBe(true);
  });
});

describe('exec-timeout', () => {
  const dPolicy: WaboxPolicy = {
    filesystem: { readwritePaths: ['D:/Tech/WABOX'] },
  };

  it('hasNonSystemDriveInPolicy detects D:', () => {
    expect(hasNonSystemDriveInPolicy(dPolicy)).toBe(true);
  });

  it('extends timeout on cold boot with non-system drive', () => {
    vi.spyOn(os, 'uptime').mockReturnValue(100);
    const ms = resolveExecTimeoutMs(dPolicy, {
      timeoutMs: 300_000,
      env: { execTimeoutMs: 300_000 },
      cwd: TEST_DIR,
    });
    expect(ms).toBeGreaterThanOrEqual(900_000);
    vi.restoreAllMocks();
  });

  it('uses base timeout after warmup', () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    process.env.WABOX_WARMUP_STATE = path.join(TEST_DIR, 'warmup.json');
    markBootWarmed(1000, 'cmd', TEST_DIR);

    const ms = resolveExecTimeoutMs(dPolicy, {
      timeoutMs: 120_000,
      cwd: TEST_DIR,
    });
    expect(ms).toBe(120_000);
    delete process.env.WABOX_WARMUP_STATE;
  });
});
