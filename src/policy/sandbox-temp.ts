import fs from 'node:fs';
import path from 'node:path';

/**
 * Sandbox temp under the workspace avoids MXC DACL mutex storms on
 * `C:\Users\...\AppData\Local` (see wxc-exec stderr: DACL mutex timeout).
 */
export function resolveSandboxTempPaths(
  workspacePath?: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const useSystem =
    env.WABOX_USE_SYSTEM_TEMP?.trim().toLowerCase() === '1' ||
    env.WABOX_USE_SYSTEM_TEMP?.trim().toLowerCase() === 'true';

  if (useSystem || !workspacePath?.trim()) {
    return [];
  }

  const tempDir = path.join(workspacePath.trim(), '.wabox', 'tmp');
  try {
    fs.mkdirSync(tempDir, { recursive: true });
  } catch {
    // wxc-exec may create; mkdir is best-effort
  }
  return [tempDir];
}
