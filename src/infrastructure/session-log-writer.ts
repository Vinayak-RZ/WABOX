import fs from 'node:fs/promises';
import path from 'node:path';
import type { SessionLog } from '../domain/types.js';

export async function writeSessionLog(logDir: string, log: SessionLog): Promise<string> {
  await fs.mkdir(logDir, { recursive: true });
  const targetPath = path.join(logDir, `${log.sessionId}.json`);
  const tempPath = `${targetPath}.tmp`;
  const payload = JSON.stringify(log, null, 2);

  await fs.writeFile(tempPath, payload, 'utf8');
  await fs.rename(tempPath, targetPath);

  return targetPath;
}
