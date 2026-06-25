import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeSessionLog } from '../../src/infrastructure/session-log-writer.js';
import type { SessionLog } from '../../src/domain/types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('writeSessionLog', () => {
  it('writes JSON atomically to the session log path', async () => {
    const logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wabox-log-'));
    tempDirs.push(logDir);

    const log: SessionLog = {
      sessionId: 'wabox-test-1',
      startedAt: new Date().toISOString(),
      preset: 'node-dev',
      policy: {
        preset: 'node-dev',
        timeoutMs: 120_000,
      },
      mirroredEnv: {
        readonlyPathsAdded: [],
        toolsFound: ['node'],
        toolsNotFound: [],
      },
      actions: [],
    };

    const writtenPath = await writeSessionLog(logDir, log);
    expect(writtenPath).toBe(path.join(logDir, 'wabox-test-1.json'));

    const raw = await fs.readFile(writtenPath, 'utf8');
    const parsed = JSON.parse(raw) as SessionLog;
    expect(parsed.sessionId).toBe('wabox-test-1');
    expect(await fs.stat(`${writtenPath}.tmp`).catch(() => null)).toBeNull();
  });
});
