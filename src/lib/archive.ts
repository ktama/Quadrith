// アーカイブ判定(設計書 §5.4)
// DB にフラグは持たず、表示時に「完了から archiveAfterHours 経過したか」で計算する。

import type { Task } from "../types/models";

export function isArchived(task: Task, nowMs: number, archiveAfterHours: number): boolean {
  return (
    task.status === "done" &&
    task.completedAt !== null &&
    Date.parse(task.completedAt) <= nowMs - archiveAfterHours * 3_600_000
  );
}
