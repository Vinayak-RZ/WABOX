import { describe, expect, it } from 'vitest';
import { mergeAgentSandboxOptions, parseMirrorEnv, readWaboxEnv } from '../../src/infrastructure/wabox-env.js';

describe('parseMirrorEnv', () => {
  it('parses minimal, full, and none', () => {
    expect(parseMirrorEnv('minimal')).toBe('minimal');
    expect(parseMirrorEnv('full')).toBe(true);
    expect(parseMirrorEnv('none')).toBe(false);
    expect(parseMirrorEnv('false')).toBe(false);
  });
});

describe('readWaboxEnv', () => {
  it('reads configured variables', () => {
    const config = readWaboxEnv({
      WABOX_MIRROR_ENV: 'minimal',
      WABOX_WORKSPACE_PATH: 'D:/Tech/WABOX',
      WABOX_EXEC_TIMEOUT_MS: '300000',
      WABOX_LOG_DIR: '.wabox/sessions',
      WABOX_DOCKER_IMAGE: 'node:22-alpine',
      WABOX_BENCHMARK_ITERATIONS: '5',
    });

    expect(config).toEqual({
      mirrorEnv: 'minimal',
      workspacePath: 'D:/Tech/WABOX',
      execTimeoutMs: 300000,
      logDir: '.wabox/sessions',
      dockerImage: 'node:22-alpine',
      benchmarkIterations: 5,
    });
  });
});

describe('mergeAgentSandboxOptions', () => {
  it('applies env defaults without overriding explicit options', () => {
    const merged = mergeAgentSandboxOptions(
      { mirrorEnv: true, policy: { filesystem: { workspacePath: 'C:/explicit' } } },
      { mirrorEnv: 'minimal', workspacePath: 'D:/from-env', execTimeoutMs: 60_000 },
    );

    expect(merged.mirrorEnv).toBe(true);
    expect(merged.policy?.filesystem?.workspacePath).toBe('C:/explicit');
    expect(merged.policy?.timeoutMs).toBe(60_000);
  });
});
