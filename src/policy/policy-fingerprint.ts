import { createHash } from 'node:crypto';
import type { WaboxPolicy } from '../domain/types.js';

/** Stable hash of filesystem paths MXC will DACL on spawn. */
export function policyFilesystemFingerprint(policy: WaboxPolicy): string {
  const ro = [...(policy.filesystem?.readonlyPaths ?? [])].map((p) => p.toLowerCase()).sort();
  const rw = [...(policy.filesystem?.readwritePaths ?? [])].map((p) => p.toLowerCase()).sort();
  const denied = [...(policy.filesystem?.deniedPaths ?? [])].map((p) => p.toLowerCase()).sort();
  const payload = JSON.stringify({ ro, rw, denied });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
