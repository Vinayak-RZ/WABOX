/** Structured debug logging for MXC exec (enable with WABOX_DEBUG=1). */

export function isExecDebugEnabled(): boolean {
  const v = process.env.WABOX_DEBUG?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function execLog(phase: string, detail?: Record<string, unknown>): void {
  if (!isExecDebugEnabled()) return;
  const ts = new Date().toISOString();
  if (detail) {
    console.error(`[wabox:exec ${ts}] ${phase}`, detail);
  } else {
    console.error(`[wabox:exec ${ts}] ${phase}`);
  }
}
