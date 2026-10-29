/**
 * One error type for the whole app. API calls, transports and features throw
 * this, and the UI shows `toUserMessage(error)`.
 */
export type AppErrorCode =
  | "NETWORK_ERROR"
  | "AUTH_REQUIRED"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "SERVER_ERROR"
  | "UNSUPPORTED_ENDPOINT"
  | "FEATURE_DISABLED"
  | "NO_SERVER"
  | "TRANSPORT_UNAVAILABLE"
  | "SSL_CERTIFICATE_ERROR"
  | "UNKNOWN_ERROR";

export class AppError extends Error {
  constructor(
    message: string,
    public code: AppErrorCode | (string & {}) = "UNKNOWN_ERROR",
    public status?: number,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Text that is safe to show in a toast. */
export function toUserMessage(
  error: unknown,
  fallback = "Something went wrong",
): string {
  if (error instanceof AppError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}
