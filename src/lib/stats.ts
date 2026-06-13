// 完了タスクの象限分布統計(仕様書 フェーズ3)
// 「緊急対応に追われていないか」= 完了タスクのうち緊急象限(Q1+Q3)の割合を可視化する。
// 集計対象は status='done' かつ未削除かつ座標あり(インボックスのまま完了したものは除外)。

import { taskQuadrant, type Quadrant } from "./quadrant";
import type { Task } from "../types/models";

export interface QuadrantStat {
  quadrant: Quadrant;
  count: number;
  ratio: number; // 0..1(total=0 のとき 0)
}

export interface CompletionStats {
  total: number;
  byQuadrant: Record<Quadrant, number>;
  stats: QuadrantStat[]; // q1, q2, q3, q4 の順
  urgentRatio: number; // (q1+q3)/total: 緊急対応に追われている割合
  plannedRatio: number; // q2/total: 計画的に処理できた割合
}

const ORDER: Quadrant[] = ["q1", "q2", "q3", "q4"];

export function completionStats(tasks: Task[]): CompletionStats {
  const byQuadrant: Record<Quadrant, number> = { q1: 0, q2: 0, q3: 0, q4: 0 };
  let total = 0;
  for (const t of tasks) {
    if (t.status !== "done" || t.deletedAt) continue;
    const q = taskQuadrant(t);
    if (!q) continue;
    byQuadrant[q]++;
    total++;
  }
  const stats = ORDER.map((q) => ({
    quadrant: q,
    count: byQuadrant[q],
    ratio: total === 0 ? 0 : byQuadrant[q] / total,
  }));
  return {
    total,
    byQuadrant,
    stats,
    urgentRatio: total === 0 ? 0 : (byQuadrant.q1 + byQuadrant.q3) / total,
    plannedRatio: total === 0 ? 0 : byQuadrant.q2 / total,
  };
}
