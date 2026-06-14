export type Status = "todo" | "doing" | "pending" | "waiting" | "done";

export const STATUSES: Status[] = ["todo", "doing", "pending", "waiting", "done"];

export const STATUS_LABELS: Record<Status, string> = {
  todo: "未着手",
  doing: "進行中",
  pending: "保留",
  waiting: "待ち",
  done: "完了",
};

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
}

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
};
