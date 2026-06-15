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

// items[i] と results[i] を対応付け、成功/失敗で分割する。
// 一括操作(removeMany / undoRemove)の「成功した分だけ反映、失敗分は巻き戻し」判定に使う。
export function partitionByResult<T>(
  items: T[],
  results: Result<unknown>[],
): { ok: T[]; failed: T[] } {
  const okItems: T[] = [];
  const failed: T[] = [];
  items.forEach((item, i) => {
    if (results[i]?.ok) okItems.push(item);
    else failed.push(item);
  });
  return { ok: okItems, failed };
}
