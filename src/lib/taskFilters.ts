// 状態・タグ・検索語によるタスクの絞り込み(各ビューで共用)

import type { Status, Task } from "../types/models";

export interface TaskFilters {
  statuses: Status[];
  tagIds: string[]; // 空 = タグで絞り込まない
  query: string;
}

export function matchesFilters(task: Task, f: TaskFilters): boolean {
  if (!f.statuses.includes(task.status)) return false;
  if (f.tagIds.length > 0 && !f.tagIds.some((id) => task.tagIds.includes(id))) return false;
  const q = f.query.trim().toLowerCase();
  if (q && !task.title.toLowerCase().includes(q) && !task.memo.toLowerCase().includes(q)) {
    return false;
  }
  return true;
}
