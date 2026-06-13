// 象限判定(仕様書 §3, §4.1)
// 正規化座標の象限境界は >= 0.5(仕様書 §3 設計ポイント)。
// 縦軸 importance = 上が高い / 横軸 urgency = 右が高い。

import type { Task } from "../types/models";

export type Quadrant = "q1" | "q2" | "q3" | "q4";

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  q1: "今すぐやる", // 重要 × 緊急(右上)
  q2: "計画する", // 重要 × 非緊急(左上)
  q3: "さばく・任せる", // 非重要 × 緊急(右下)
  q4: "やめる候補", // 非重要 × 非緊急(左下)
};

// マトリクス上の見た目どおりの並び(左上, 右上, 左下, 右下)
export const QUADRANT_GRID_ORDER: Quadrant[] = ["q2", "q1", "q4", "q3"];

export function quadrantOf(importance: number, urgency: number): Quadrant {
  const important = importance >= 0.5;
  const urgent = urgency >= 0.5;
  if (important && urgent) return "q1";
  if (important && !urgent) return "q2";
  if (!important && urgent) return "q3";
  return "q4";
}

// 座標なし(インボックス)のタスクは null
export function taskQuadrant(task: Task): Quadrant | null {
  if (task.importance === null || task.urgency === null) return null;
  return quadrantOf(task.importance, task.urgency);
}
