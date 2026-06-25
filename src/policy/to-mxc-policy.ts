import type { SandboxPolicy } from '@microsoft/mxc-sdk';
import type { WaboxPolicy } from '../domain/types.js';
import { MXC_SCHEMA_VERSION } from '../infrastructure/mxc-constants.js';
import { commandRequiresWindowsUi } from './shell-detect.js';

export interface ToMxcPolicyOptions {
  command: string;
  policy: WaboxPolicy;
}

export function toMxcPolicy(options: ToMxcPolicyOptions): SandboxPolicy {
  const { policy, command } = options;
  const allowWindows =
    policy.ui?.allowWindows === true || commandRequiresWindowsUi(command);

  return {
    version: MXC_SCHEMA_VERSION,
    filesystem: {
      readonlyPaths: policy.filesystem?.readonlyPaths,
      readwritePaths: policy.filesystem?.readwritePaths,
      deniedPaths: policy.filesystem?.deniedPaths,
    },
    network: {
      allowOutbound: policy.network?.allowOutbound ?? false,
    },
    ui: {
      allowWindows,
    },
    timeoutMs: policy.timeoutMs,
  };
}
