// 週次レビュー(仕様 §4.11)の純粋ロジック。
// 各ステップの「対象タスク抽出」と「毎週リマインドの要否」を担う。
// 実際の操作(期限変更・完了・状態変更…)は既存ストアで行うため、ここは読み取りのみ。

import { taskQuadrant } from "./quadrant";
import { dateOf, weekStartOf } from "./stats";
import { daysSince, STALE_Q2_DAYS } from "./reminders";
import type { Task, WeeklyReviewSetting, WeekStart } from "../types/models";

export type ReviewStep = "summary" | "due" | "stale" | "review" | "inbox" | "plan";

export const REVIEW_STEPS: ReviewStep[] = ["summary", "due", "stale", "review", "inbox", "plan"];

export const REVIEW_STEP_LABELS: Record<ReviewStep, string> = {
  summary: "今週の振り返り",
  due: "期限の棚卸し",
  stale: "第2領域の放置",
  review: "保留・待ちの再確認",
  inbox: "インボックス仕分け",
  plan: "来週の計画",
};

function addDays(date: string, n: number): string {
  const d = new Date(`${dateOf(date)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ステップ2「期限の棚卸し」: 期限超過 + 今週期限の未完了タスク(期限が古い順)。
export function dueBacklog(tasks: Task[], today: string, weekStart: WeekStart): Task[] {
  const weekEnd = addDays(weekStartOf(today, weekStart), 6);
  return tasks
    .filter(
      (t) =>
        !t.deletedAt &&
        t.status !== "done" &&
        t.dueDate !== null &&
        t.dueDate <= weekEnd,
    )
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
}

// ステップ3「第2領域の放置」: 未完了の第2領域で、最終進捗が放置閾値超 or 未進捗(経過日数の降順)。
export function staleQ2(tasks: Task[], nowMs: number, staleDays = STALE_Q2_DAYS): Task[] {
  return tasks
    .filter((t) => {
      if (t.deletedAt || t.status === "done") return false;
      if (taskQuadrant(t) !== "q2") return false;
      return daysSince(t.lastProgressAt, nowMs) >= staleDays;
    })
    .sort((a, b) => Date.parse(a.lastProgressAt) - Date.parse(b.lastProgressAt));
}

// ステップ4「保留・待ちの再確認」: 保留・待ちで再確認日が今日以前 or 未設定。
export function reviewBacklog(tasks: Task[], today: string): Task[] {
  return tasks.filter(
    (t) =>
      !t.deletedAt &&
      (t.status === "pending" || t.status === "waiting") &&
      (t.reviewAt === null || t.reviewAt <= today),
  );
}

// ステップ5「インボックス仕分け」: 未仕分け(座標なし)の未完了タスク。
export function inboxTasks(tasks: Task[]): Task[] {
  return tasks.filter(
    (t) => !t.deletedAt && t.status !== "done" && t.importance === null && t.urgency === null,
  );
}

// 毎週リマインドの要否(アプリ内バナー)。Rust スケジューラは使わない。
// 当週の設定曜日・設定時刻を過ぎ、かつ当週まだレビューしていなければ true。
// nowTime は 'HH:mm'(ローカル, 比較は文字列の辞書順で成立する zero-padded 前提)。
export function dueForWeeklyReview(
  setting: WeeklyReviewSetting,
  today: string,
  nowTime: string,
  lastReviewAt: string | null,
  weekStart: WeekStart,
): boolean {
  if (!setting.enabled) return false;
  const weekStartDate = weekStartOf(today, weekStart);
  // 設定曜日(ISO 1=月〜7=日)の、今週における日付を求める
  const offset = weekStart === "monday" ? setting.weekday - 1 : setting.weekday % 7;
  const targetDate = addDays(weekStartDate, offset);
  if (today < targetDate) return false; // まだ設定曜日に達していない
  if (today === targetDate && nowTime < setting.time) return false; // 当日だが設定時刻前
  // 当週内にレビュー済みなら出さない
  if (lastReviewAt !== null && dateOf(lastReviewAt) >= weekStartDate) return false;
  return true;
}
