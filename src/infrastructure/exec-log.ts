import { debugLog, getDebugLevel, isDebugAtLeast } from './debug.js';

/** @deprecated Use isDebugAtLeast('info') — kept for call sites. */
export function isExecDebugEnabled(): boolean {
  return isDebugAtLeast('info');
}

export function isExecTraceEnabled(): boolean {
  return isDebugAtLeast('trace');
}

export function execLog(phase: string, detail?: Record<string, unknown>): void {
  debugLog('exec', phase, detail);
}

export function policyLog(phase: string, detail?: Record<string, unknown>): void {
  if (!isDebugAtLeast('verbose')) return;
  debugLog('policy', phase, detail);
}

export { getDebugLevel };
