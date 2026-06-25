export type WaboxErrorCode =
  | 'PLATFORM_UNSUPPORTED'
  | 'SANDBOX_SPAWN_FAILED'
  | 'EXEC_TIMEOUT'
  | 'SESSION_DESTROYED'
  | 'POLICY_BUILD_FAILED';

export interface WaboxErrorDetails {
  code: WaboxErrorCode;
  message: string;
  details?: unknown;
}

export class WaboxError extends Error {
  readonly code: WaboxErrorCode;
  readonly details?: unknown;

  constructor(error: WaboxErrorDetails) {
    super(error.message);
    this.name = 'WaboxError';
    this.code = error.code;
    this.details = error.details;
  }

  toJSON(): { success: false; error: WaboxErrorDetails } {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

export function isWaboxError(error: unknown): error is WaboxError {
  return error instanceof WaboxError;
}
