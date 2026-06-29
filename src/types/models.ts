import type { Quadrant } from "../lib/quadrant";

export type Status = "todo" | "doing" | "pending" | "waiting" | "done";

export const STATUSES: Status[] = ["todo", "doing", "pending", "waiting", "done"];

export const STATUS_LABELS: Record<Status, string> = {
  todo: "未着手",
  doing: "進行中",
  pending: "保留",
  waiting: "待ち",
  done: "完了",
};

// 工数の概算(Tシャツサイズ, 仕様 §4.10)。null = 未見積り
export type EffortSize = "S" | "M" | "L" | "XL";

export const EFFORT_SIZES: EffortSize[] = ["S", "M", "L", "XL"];

export interface Task {
  id: string;
  title: string;
  memo: string;
  importance: number | null; // 0.0〜1.0(縦軸、上が高)。null = インボックス
  urgency: number | null; // 0.0〜1.0(横軸、右が高)。importance と常に同時に null
  status: Status;
  dueDate: string | null; // 'YYYY-MM-DD'
  reviewAt: string | null; // 'YYYY-MM-DD'
  createdAt: string; // ISO 8601 (UTC)
  updatedAt: string;
  lastProgressAt: string; // 状態変更など「進捗」のあった日時。放置リマインドの基準
  completedAt: string | null;
  deletedAt: string | null;
  templateId: string | null; // 生成元の繰り返しひな型。null = 通常タスク
  category: string | null; // 任意のカテゴリ(Redmine エクスポート用, §4.8)。null = 未設定
  effortSize: EffortSize | null; // 工数の概算(§4.10)。null = 未見積り
  todayDate: string | null; // 「今日やる」予定日 'YYYY-MM-DD'(§4.9)。null = 未指定
  todayOrder: number | null; // グループB(選択)の手動並び。null = 未指定
  tagIds: string[];
}

// 定期タスクのひな型(仕様 §4.7)。発生日に Task を1件生成する。
export type RecurFreq = "daily" | "weekly" | "monthly" | "yearly";

export const RECUR_FREQ_LABELS: Record<RecurFreq, string> = {
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
  yearly: "毎年",
};

export interface RecurringTemplate {
  id: string;
  title: string;
  memo: string;
  importance: number | null; // 実体へ継承(urgency と常に同時に null)
  urgency: number | null;
  freq: RecurFreq;
  interval: number; // N日/N週/Nヶ月/N年ごと(>=1)
  byweekday: number[]; // weekly用: ISO 1=月〜7=日(複数可)
  bymonthday: number | null; // monthly用: 1〜31(該当日なき月は末日丸め)
  anchorDate: string; // 'YYYY-MM-DD' 起点日
  nextDue: string; // 'YYYY-MM-DD' 次に生成すべき発生日
  active: boolean; // false = 停止
  createdAt: string;
  updatedAt: string;
  category: string | null; // 実体へ継承するカテゴリ(§4.8)。null = 未設定
  effortSize: EffortSize | null; // 実体へ継承する工数(§4.10)。null = 未見積り
  tagIds: string[];
}

export interface Tag {
  id: string;
  name: string;
  color: string; // HEX
}

// settings.json(ブートストラップ層、tauri-plugin-store)
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BootstrapSettings {
  dbPath: string;
  window?: WindowState;
  redmineTracker?: string; // Redmine エクスポートのトラッカー名(§4.8)。未設定なら 'タスク'
}

// Redmine エクスポートのマッピング(仕様 §4.8 / 設計 §11)。トラッカー名は環境差で
// インポート全失敗を招くため別途 settings.json に持つ(ここには含めない)。
export type RedminePriorityKey = Quadrant | "inbox";

export interface RedmineMapping {
  statusMap: Record<Status, string>; // 5状態 → Redmine ステータス名
  priorityMap: Record<RedminePriorityKey, string>; // 象限 → Redmine 優先度名
  forceNewStatus: boolean; // Redmine ワークフロー対策: 全行を「新規」相当で出力
  includeStartDate: boolean; // 開始日列(createdAt の日付)を出力するか
  includeCategory: boolean; // カテゴリ列を出力するか
}

export const DEFAULT_REDMINE_MAPPING: RedmineMapping = {
  statusMap: {
    todo: "新規",
    doing: "進行中",
    pending: "フィードバック",
    waiting: "フィードバック",
    done: "終了",
  },
  priorityMap: {
    q1: "急いで", // 重要 × 緊急
    q2: "高め", // 重要 × 非緊急
    q3: "通常", // 非重要 × 緊急
    q4: "低め", // 非重要 × 非緊急
    inbox: "通常", // 座標なし
  },
  forceNewStatus: false,
  includeStartDate: true,
  includeCategory: true,
};

// 統計の週の起点(仕様 §4.11)
export type WeekStart = "monday" | "sunday";

// 週次レビューの毎週リマインド(仕様 §4.11)。既定オフ
export interface WeeklyReviewSetting {
  enabled: boolean; // 既定 false
  weekday: number; // ISO 1=月〜7=日。既定 1(月)
  time: string; // 'HH:mm'。既定 '09:00'
}

export const DEFAULT_EFFORT_MINUTES: Record<EffortSize, number> = {
  S: 15,
  M: 60,
  L: 180,
  XL: 480,
};

export const DEFAULT_WEEKLY_REVIEW: WeeklyReviewSetting = {
  enabled: false,
  weekday: 1,
  time: "09:00",
};

// DB内 settings テーブル(アプリ設定層)
export interface AppSettings {
  statusColors: Record<Status, string>;
  archiveAfterHours: number;
  theme: "light" | "dark" | "system";
  quickAddHotkey: string; // クイック追加のグローバルホットキー
  autoStart: boolean; // Windows 起動時に常駐開始するか
  closeToTray: boolean; // 閉じるボタンでトレイへ最小化するか
  notifyTime: string; // 'HH:mm' 期限・再確認日通知の発火時刻
  backupGenerations: number;
  backupDir: string | null; // null = DBと同じフォルダの backups/
  categories: string[]; // カテゴリ候補(タスクへ割当, §4.8)
  redmineExport: RedmineMapping; // Redmine エクスポートのマッピング(§4.8)
  effortMinutes: Record<EffortSize, number>; // 工数サイズ→分(§4.10)
  dailyCapacityMinutes: number; // 容量メーターの分母(§4.9)。既定 360
  todayIncludeUrgentQuadrant: boolean; // Today に「今すぐやる」象限を自動取り込み(§4.9)。既定 true
  weekStart: WeekStart; // 統計の週起点(§4.11)。既定 'monday'
  weeklyReview: WeeklyReviewSetting; // 週次レビューの毎週リマインド(§4.11)
  lastReviewAt: string | null; // 前回レビュー日時 ISO(記録のみ, §4.11)
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  statusColors: {
    todo: "#94a3b8",
    doing: "#3b82f6",
    pending: "#eab308",
    waiting: "#a855f7",
    done: "#22c55e",
  },
  archiveAfterHours: 24,
  theme: "light",
  quickAddHotkey: "Ctrl+Shift+Space",
  autoStart: false,
  closeToTray: true,
  notifyTime: "09:00",
  backupGenerations: 3,
  backupDir: null,
  categories: [],
  redmineExport: DEFAULT_REDMINE_MAPPING,
  effortMinutes: DEFAULT_EFFORT_MINUTES,
  dailyCapacityMinutes: 360,
  todayIncludeUrgentQuadrant: true,
  weekStart: "monday",
  weeklyReview: DEFAULT_WEEKLY_REVIEW,
  lastReviewAt: null,
};
