import type { WaboxPolicy } from '../domain/types.js';
import { NODE_DEV_PRESET_TOOLS } from '../infrastructure/mxc-constants.js';

export const NODE_DEV_PRESET: WaboxPolicy = {
  filesystem: {
    readwritePaths: [],
    readonlyPaths: [],
    deniedPaths: [],
  },
  network: {
    allowOutbound: false,
  },
  timeoutMs: 120_000,
};

export const NODE_DEV_EXPECTED_TOOLS = [...NODE_DEV_PRESET_TOOLS];
