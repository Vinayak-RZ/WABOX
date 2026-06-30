import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isBootWarmedForPolicy, markBootWarmed, clearWarmupState } from '../../src/infrastructure/warmup-state.js';
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

  it('isBootWarmedForPolicy is false until markBootWarmed with matching policy', () => {
    const policy: WaboxPolicy = { filesystem: { readwritePaths: ['D:/Tech/WABOX'] } };
    expect(isBootWarmedForPolicy(policy, TEST_DIR)).toBe(false);
    markBootWarmed(1000, 'cmd /c echo', policy, TEST_DIR);
    expect(isBootWarmedForPolicy(policy, TEST_DIR)).toBe(true);
  });

  it('warmup is stale when policy paths change', () => {
    const policyA: WaboxPolicy = { filesystem: { readwritePaths: ['D:/Tech/WABOX'] } };
    const policyB: WaboxPolicy = {
      filesystem: { readwritePaths: ['D:/Tech/WABOX', 'D:/Tech/WABOX/.wabox/tmp'] },
    };
    markBootWarmed(1000, 'cmd', policyA, TEST_DIR);
    expect(isBootWarmedForPolicy(policyB, TEST_DIR)).toBe(false);
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

  it('uses base timeout after warmup for same policy', () => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    process.env.WABOX_WARMUP_STATE = path.join(TEST_DIR, 'warmup.json');
    markBootWarmed(1000, 'cmd', dPolicy, TEST_DIR);

    const ms = resolveExecTimeoutMs(dPolicy, {
      timeoutMs: 120_000,
      cwd: TEST_DIR,
    });
    expect(ms).toBe(120_000);
    delete process.env.WABOX_WARMUP_STATE;
  });
});
