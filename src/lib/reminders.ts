// リマインド(仕様書 フェーズ3)
// 3種を1つのリストに統合する:
//   due    … 期限当日・期限超過(仕様書 §4.1)
//   review … 再確認日が到来した保留・待ちタスク(仕様書 §4.3、死蔵防止)
//   stale  … 第2領域(重要×非緊急)を一定期間放置したタスク
// OS通知に載せるのは日付ベースの due / review のみ。stale はアプリ内表示専用。

import { taskQuadrant } from "./quadrant";
import type { Task } from "../types/models";

export type ReminderKind = "due" | "review" | "stale";

export interface ReminderItem {
  kind: ReminderKind;
  task: Task;
  detail: string;
}

export const STALE_Q2_DAYS = 14; // 第2領域をこの日数放置したらリマインド

// 基準時刻(nowMs)から見た iso の経過日数。stats / review でも放置日数の算出に使う。
export function daysSince(iso: string, nowMs: number): number {
  return Math.floor((nowMs - Date.parse(iso)) / 86_400_000);
}

// today: ローカル日付 'YYYY-MM-DD'(due_date / review_at と同じ表現で文字列比較)
export function computeReminders(
  tasks: Task[],
  today: string,
  nowMs: number,
  staleDays = STALE_Q2_DAYS,
): ReminderItem[] {
  const items: ReminderItem[] = [];
  for (const t of tasks) {
    if (t.deletedAt || t.status === "done") continue;

    if (t.dueDate && t.dueDate <= today) {
      items.push({
        kind: "due",
        task: t,
        detail: t.dueDate < today ? `期限超過(${t.dueDate})` : "今日が期限",
      });
    }

    if (t.reviewAt && t.reviewAt <= today && (t.status === "pending" || t.status === "waiting")) {
      items.push({ kind: "review", task: t, detail: `再確認日(${t.reviewAt})` });
    }

    if (taskQuadrant(t) === "q2") {
      // 配置やタグ編集ではなく「進捗」のあった日時を基準にする(放置の正確な検出)
      const d = daysSince(t.lastProgressAt, nowMs);
      if (d >= staleDays) {
        items.push({ kind: "stale", task: t, detail: `${d}日間進捗なし(重要×非緊急)` });
      }
    }
  }
  return items;
}

// OS通知に載せる日付ベースのリマインド(due + review)。stale は除外。
export function notifiableReminders(items: ReminderItem[]): ReminderItem[] {
  return items.filter((i) => i.kind !== "stale");
}
