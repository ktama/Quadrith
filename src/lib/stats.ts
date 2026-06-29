// 完了タスクの象限分布統計(仕様書 フェーズ3)
// 「緊急対応に追われていないか」= 完了タスクのうち緊急象限(Q1+Q3)の割合を可視化する。
// 集計対象は status='done' かつ未削除かつ座標あり(インボックスのまま完了したものは除外)。

import { taskQuadrant, type Quadrant } from "./quadrant";
import { sumEffortMinutes } from "./effort";
import { daysSince } from "./reminders";
import type { EffortSize, Task, WeekStart } from "../types/models";

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

// ───────────────────────────────────────────────────────────────────────────
// 統計の深化(仕様 §4.11)。すべて純粋関数。
//
// 日付の扱い: created_at / completed_at は ISO(UTC)で保存されるため、
//   日のキーは保存値の先頭10文字(UTC 日付)を用いる(決定的でテスト容易)。
//   today_date は元からローカル日付 'YYYY-MM-DD' なのでそのまま使う。
// 集計対象は「有効タスク(未削除)」。アーカイブ済み完了も findAllAlive に含まれる。
// ───────────────────────────────────────────────────────────────────────────

// ISO/日付文字列の日付部分(先頭10文字)。review.ts もこれを使う。
export function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

// 'YYYY-MM-DD' を、週起点に揃えた週頭の 'YYYY-MM-DD' へ丸める。UTC 解釈で tz 非依存。
export function weekStartOf(date: string, weekStart: WeekStart): string {
  const d = new Date(`${dateOf(date)}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=日〜6=土
  const back = weekStart === "monday" ? (dow === 0 ? 6 : dow - 1) : dow;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface ThroughputBucket {
  week: string;
  count: number;
  minutes: number; // 完了タスクの工数(分)合計。未見積りは 0 扱い
}

// 完了スループット: 週ごとの完了件数 + 工数(分)合計。
export function throughputByWeek(
  tasks: Task[],
  effortMap: Record<EffortSize, number>,
  weekStart: WeekStart,
): ThroughputBucket[] {
  const buckets = new Map<string, { count: number; sizes: (EffortSize | null)[] }>();
  for (const t of tasks) {
    if (t.deletedAt || t.status !== "done" || !t.completedAt) continue;
    const week = weekStartOf(dateOf(t.completedAt), weekStart);
    const b = buckets.get(week) ?? { count: 0, sizes: [] };
    b.count++;
    b.sizes.push(t.effortSize);
    buckets.set(week, b);
  }
  return [...buckets.entries()]
    .map(([week, b]) => ({ week, count: b.count, minutes: sumEffortMinutes(b.sizes, effortMap) }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

export interface CreatedCompletedBucket {
  week: string;
  created: number;
  completed: number;
  diff: number; // created - completed
}

// 作成 vs 完了: 週ごとの作成件数・完了件数とその差。
export function createdVsCompletedByWeek(tasks: Task[], weekStart: WeekStart): CreatedCompletedBucket[] {
  const buckets = new Map<string, { created: number; completed: number }>();
  const bump = (week: string, key: "created" | "completed") => {
    const b = buckets.get(week) ?? { created: 0, completed: 0 };
    b[key]++;
    buckets.set(week, b);
  };
  for (const t of tasks) {
    if (t.deletedAt) continue;
    bump(weekStartOf(dateOf(t.createdAt), weekStart), "created");
    if (t.status === "done" && t.completedAt) {
      bump(weekStartOf(dateOf(t.completedAt), weekStart), "completed");
    }
  }
  return [...buckets.entries()]
    .map(([week, b]) => ({ week, created: b.created, completed: b.completed, diff: b.created - b.completed }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

// 第2領域リードタイム: 完了した第2領域タスクの「完了 − 作成」(日)の中央値。なければ null。
export function q2LeadTimeMedianDays(tasks: Task[]): number | null {
  const days: number[] = [];
  for (const t of tasks) {
    if (t.deletedAt || t.status !== "done" || !t.completedAt) continue;
    if (taskQuadrant(t) !== "q2") continue;
    days.push(Math.max(0, daysSince(t.createdAt, Date.parse(t.completedAt))));
  }
  return median(days);
}

export interface StaleItem {
  task: Task;
  days: number; // 最終進捗(なければ作成)からの経過日数
}

// 第2領域の放置: 未完了の第2領域タスクを、最終進捗からの経過日数の降順に上位 limit 件。
export function q2StaleTop(tasks: Task[], nowMs: number, limit: number): StaleItem[] {
  const items: StaleItem[] = [];
  for (const t of tasks) {
    if (t.deletedAt || t.status === "done") continue;
    if (taskQuadrant(t) !== "q2") continue;
    items.push({ task: t, days: daysSince(t.lastProgressAt, nowMs) });
  }
  items.sort((a, b) => b.days - a.days || a.task.createdAt.localeCompare(b.task.createdAt));
  return items.slice(0, limit);
}

// 最古の未着手: 未着手タスクを作成が古い順に上位 limit 件。
export function oldestTodos(tasks: Task[], limit: number): Task[] {
  return tasks
    .filter((t) => !t.deletedAt && t.status === "todo")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

export interface BalanceBucket {
  week: string;
  ratio: Record<Quadrant, number>; // 週内完了に占める各象限の割合(合計1、完了0なら全0)
}

// 象限バランスの推移: 週ごとの完了に占める各象限の割合。
export function quadrantBalanceByWeek(tasks: Task[], weekStart: WeekStart): BalanceBucket[] {
  const buckets = new Map<string, Record<Quadrant, number>>();
  for (const t of tasks) {
    if (t.deletedAt || t.status !== "done" || !t.completedAt) continue;
    const q = taskQuadrant(t);
    if (!q) continue;
    const week = weekStartOf(dateOf(t.completedAt), weekStart);
    const b = buckets.get(week) ?? { q1: 0, q2: 0, q3: 0, q4: 0 };
    b[q]++;
    buckets.set(week, b);
  }
  return [...buckets.entries()]
    .map(([week, counts]) => {
      const total = counts.q1 + counts.q2 + counts.q3 + counts.q4;
      const ratio: Record<Quadrant, number> = {
        q1: total === 0 ? 0 : counts.q1 / total,
        q2: total === 0 ? 0 : counts.q2 / total,
        q3: total === 0 ? 0 : counts.q3 / total,
        q4: total === 0 ? 0 : counts.q4 / total,
      };
      return { week, ratio };
    })
    .sort((a, b) => a.week.localeCompare(b.week));
}

export interface AdherenceBucket {
  week: string;
  planned: number; // その週に「今日やる」予定だった件数
  completed: number; // うち予定日に完了できた件数
  ratio: number; // completed / planned(planned 0 なら 0)
}

// 計画遵守率(緩い定義): 「今日やる」(today_date)に入れた日に完了できた割合(週次)。
// 繰り越しで today_date は最後に計画した日へ更新されるため「最後に計画した日に完了したか」を測る。
export function planAdherenceByWeek(tasks: Task[], weekStart: WeekStart): AdherenceBucket[] {
  const buckets = new Map<string, { planned: number; completed: number }>();
  for (const t of tasks) {
    if (t.deletedAt || t.todayDate === null) continue;
    const week = weekStartOf(t.todayDate, weekStart);
    const b = buckets.get(week) ?? { planned: 0, completed: 0 };
    b.planned++;
    if (t.status === "done" && t.completedAt && dateOf(t.completedAt) === t.todayDate) {
      b.completed++;
    }
    buckets.set(week, b);
  }
  return [...buckets.entries()]
    .map(([week, b]) => ({
      week,
      planned: b.planned,
      completed: b.completed,
      ratio: b.planned === 0 ? 0 : b.completed / b.planned,
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

// 未見積り率: 有効タスク(未削除・未完了)のうち工数未設定の割合。
export function unestimatedRatio(tasks: Task[]): { total: number; unestimated: number; ratio: number } {
  let total = 0;
  let unestimated = 0;
  for (const t of tasks) {
    if (t.deletedAt || t.status === "done") continue;
    total++;
    if (t.effortSize === null) unestimated++;
  }
  return { total, unestimated, ratio: total === 0 ? 0 : unestimated / total };
}
