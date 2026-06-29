// Today / フォーカスビューの純粋ロジック(仕様 §4.9)
// 2グループ(自動 / 選択)へ分け、各カードに理由バッジを付ける。
// 並び順・繰り越し・容量集計をここで決め、UI とストアは結果を使うだけにする。

import { taskQuadrant } from "./quadrant";
import { sumEffortMinutes } from "./effort";
import type { EffortSize, Task } from "../types/models";

export type TodayBadge = "overdue" | "due-today" | "doing" | "review" | "urgent" | "pick";

export interface TodayCard {
  task: Task;
  badges: TodayBadge[]; // 理由が複数なら複数。pick は「今日やる」指定も兼ねるとき付く
}

export interface TodayGroups {
  auto: TodayCard[]; // グループA「締切・進行中(自動)」規定順
  picks: TodayCard[]; // グループB「今日やる(選択)」today_order 順
}

// グループA の主要素ソート順(小さいほど上)。表示バッジは複数でも並びはこの優先度で決まる。
const AUTO_RANK: Record<Exclude<TodayBadge, "pick">, number> = {
  overdue: 0,
  "due-today": 1,
  doing: 2,
  review: 3,
  urgent: 4,
};

// 1タスクの自動グループ理由(pick を除く)。該当なしなら空配列。
function autoBadges(task: Task, today: string, includeUrgent: boolean): Exclude<TodayBadge, "pick">[] {
  const badges: Exclude<TodayBadge, "pick">[] = [];
  if (task.dueDate) {
    if (task.dueDate < today) badges.push("overdue");
    else if (task.dueDate === today) badges.push("due-today");
  }
  if (task.status === "doing") badges.push("doing");
  // 再確認は既存リマインドと整合し「到来(<= today)」で判定する(§4.9)
  if (task.reviewAt && task.reviewAt <= today) badges.push("review");
  if (includeUrgent && taskQuadrant(task) === "q1") badges.push("urgent");
  return badges;
}

function primaryRank(badges: TodayBadge[]): number {
  let rank = Number.POSITIVE_INFINITY;
  for (const b of badges) {
    if (b === "pick") continue;
    rank = Math.min(rank, AUTO_RANK[b]);
  }
  return rank;
}

// 未完了・未削除のタスクを2グループへ振り分ける。
// auto に入るタスクは picks から除外し、auto 側カードに "pick" バッジを足す(二重表示しない)。
export function todayGroups(tasks: Task[], today: string, includeUrgent: boolean): TodayGroups {
  const auto: TodayCard[] = [];
  const picks: TodayCard[] = [];

  for (const t of tasks) {
    if (t.deletedAt || t.status === "done") continue;
    const isPick = t.todayDate === today;
    const ab = autoBadges(t, today, includeUrgent);
    if (ab.length > 0) {
      const badges: TodayBadge[] = isPick ? [...ab, "pick"] : [...ab];
      auto.push({ task: t, badges });
    } else if (isPick) {
      picks.push({ task: t, badges: ["pick"] });
    }
  }

  auto.sort((a, b) => {
    const ra = primaryRank(a.badges);
    const rb = primaryRank(b.badges);
    if (ra !== rb) return ra - rb;
    // 期限超過どうしは期限が古い順
    if (ra === AUTO_RANK.overdue) {
      const da = a.task.dueDate ?? "";
      const db = b.task.dueDate ?? "";
      if (da !== db) return da.localeCompare(db);
    }
    return a.task.createdAt.localeCompare(b.task.createdAt);
  });

  picks.sort((a, b) => {
    const oa = a.task.todayOrder ?? Number.MAX_SAFE_INTEGER;
    const ob = b.task.todayOrder ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.task.createdAt.localeCompare(b.task.createdAt);
  });

  return { auto, picks };
}

// 未完了の「今日やる」で today_date が過去日のものを当日へ繰り越す(並びは保持)。
// 返り値は patch すべき差分のみ。完了済みは据え置く(計画遵守の集計に使う)。
export function carryOverToday(tasks: Task[], today: string): { id: string; todayDate: string }[] {
  const out: { id: string; todayDate: string }[] = [];
  for (const t of tasks) {
    if (t.deletedAt || t.status === "done") continue;
    if (t.todayDate !== null && t.todayDate < today) {
      out.push({ id: t.id, todayDate: today });
    }
  }
  return out;
}

export interface CapacitySummary {
  estimatedMinutes: number; // Today 表示中・未完了・見積りありの合計
  capacityMinutes: number; // 設定 dailyCapacityMinutes
  remainingMinutes: number; // capacity - estimated(負なら超過)
  over: boolean;
  unestimatedCount: number; // Today 表示中・未完了・未見積りの件数
}

// Today 表示中(auto + picks)の未完了タスクから容量を集計する。
export function capacitySummary(
  groups: TodayGroups,
  effortMap: Record<EffortSize, number>,
  capacity: number,
): CapacitySummary {
  const sizes = [...groups.auto, ...groups.picks].map((c) => c.task.effortSize);
  const estimatedMinutes = sumEffortMinutes(sizes, effortMap);
  const unestimatedCount = sizes.filter((s) => s === null).length;
  return {
    estimatedMinutes,
    capacityMinutes: capacity,
    remainingMinutes: capacity - estimatedMinutes,
    over: estimatedMinutes > capacity,
    unestimatedCount,
  };
}
