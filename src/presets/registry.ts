import type { PresetName, WaboxPolicy } from '../domain/types.js';
import { NODE_DEV_PRESET } from './node-dev.js';

const PRESETS: Record<PresetName, WaboxPolicy> = {
  'node-dev': NODE_DEV_PRESET,
};

export function getPreset(name: PresetName): WaboxPolicy {
  return structuredClone(PRESETS[name]);
}

export function listPresets(): PresetName[] {
  return Object.keys(PRESETS) as PresetName[];
}
