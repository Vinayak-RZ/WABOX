import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let loaded = false;

/** Load `.env` from cwd or package root (first match). Safe to call multiple times. */
export function loadWaboxDotenv(cwd: string = process.cwd()): void {
  if (loaded) return;

  const candidates = [path.join(cwd, '.env'), path.join(packageRoot, '.env')];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      loaded = true;
      return;
    }
  }
}
