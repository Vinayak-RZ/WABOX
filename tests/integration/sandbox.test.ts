import { describe, expect, it } from 'vitest';
import { createAgentSandbox, getSupportStatus } from '../../src/index.js';

const runIntegration = process.env.WABOX_INTEGRATION === '1';

describe.skipIf(!runIntegration)('integration', () => {
  it('runs node inside a sandbox session', async () => {
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

    const result = await sandbox.exec('node -e "console.log(2)"', { label: 'math' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('2');
    expect(result.actionId).toBe(1);

    const log = await sandbox.destroy();
    expect(log.actions).toHaveLength(1);
    expect(log.actions[0]?.label).toBe('math');
  }, 180_000);
});

describe('getSupportStatus', () => {
  it('returns structured platform info', () => {
    const status = getSupportStatus();
    expect(status.nodeVersion).toBeTruthy();
    expect(Array.isArray(status.availableBackends)).toBe(true);
    expect(typeof status.supported).toBe('boolean');
  });
});
