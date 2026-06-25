import { getPlatformSupport } from '@microsoft/mxc-sdk';
import os from 'node:os';
import { WaboxError } from '../domain/errors.js';
import type { SupportStatus } from '../domain/types.js';

export function getSupportStatus(): SupportStatus {
  const mxc = getPlatformSupport();
  const errors: string[] = [];

  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (nodeMajor < 18) {
    errors.push(`Node.js ${process.versions.node} detected; Node.js >= 18 is required.`);
  }

  if (process.platform !== 'win32') {
    errors.push(`WABOX MVP targets Windows native sandboxing; current platform is ${process.platform}.`);
  }

  if (!mxc.isSupported) {
    errors.push(mxc.reason ?? 'MXC is not supported on this host.');
  }

  const supported = mxc.isSupported && process.platform === 'win32' && nodeMajor >= 18;

  return {
    supported,
    nodeVersion: process.versions.node,
    platform: `${os.type()} ${os.release()}`,
    mxcSupported: mxc.isSupported,
    mxcReason: mxc.reason,
    availableBackends: mxc.availableMethods ?? [],
    isolationTier: mxc.isolationTier,
    isolationWarnings: mxc.isolationWarnings,
    errors,
  };
}

export function assertPlatformSupported(): void {
  const status = getSupportStatus();
  if (!status.supported) {
    throw new WaboxError({
      code: 'PLATFORM_UNSUPPORTED',
      message: status.errors.join(' ') || 'WABOX is not supported on this host.',
      details: status,
    });
  }
}
