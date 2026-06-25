import { describe, expect, it } from 'vitest';
import { createAgentSandbox, getSupportStatus } from '../../src/index.js';

const runIntegration = process.env.WABOX_INTEGRATION === '1';

describe.skipIf(!runIntegration)('integration', () => {
  it(
    'runs node inside a sandbox session',
    async () => {
    const status = getSupportStatus();
    expect(status.supported).toBe(true);

    const sandbox = createAgentSandbox({
      preset: 'node-dev',
      policy: {
        filesystem: {
          workspacePath: process.cwd(),
        },
      },
      logDir: '.wabox/test-sessions',
    });

    const result = await sandbox.exec('cmd /c echo wabox-ok', {
      label: 'smoke',
      timeoutMs: 30_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toContain('wabox-ok');

    const nodeResult = await sandbox.exec('node -e "console.log(2)"', {
      label: 'math',
      timeoutMs: 30_000,
    });
    expect(nodeResult.exitCode).toBe(0);
    expect(nodeResult.stdout.trim()).toBe('2');

    const log = await sandbox.destroy();
    expect(log.actions.length).toBeGreaterThanOrEqual(2);
  },
    120_000,
  );
});

describe('getSupportStatus', () => {
  it('returns structured platform info', () => {
    const status = getSupportStatus();
    expect(status.nodeVersion).toBeTruthy();
    expect(Array.isArray(status.availableBackends)).toBe(true);
    expect(typeof status.supported).toBe('boolean');
  });
});
