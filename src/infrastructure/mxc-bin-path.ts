import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function mxcSdkRoot(): string {
  return path.dirname(require.resolve('@microsoft/mxc-sdk/package.json'));
}

/** Path to wxc-host-prep.exe shipped with @microsoft/mxc-sdk. */
export function resolveMxcHostPrepPath(): string {
  return path.join(mxcSdkRoot(), 'bin', 'x64', 'wxc-host-prep.exe');
}
