export type AppErrorCode = "DB_OPEN" | "DB_READ" | "DB_WRITE" | "FS" | "UNKNOWN";

export interface AppError {
  code: AppErrorCode;
  message: string;
  cause?: unknown;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(code: AppErrorCode, message: string, cause?: unknown): Result<T> {
  console.error(`[${code}] ${message}`, cause);
  return { ok: false, error: { code, message, cause } };
}
