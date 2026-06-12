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
  completedAt: string | null;
  deletedAt: string | null;
  tagIds: string[];
}

export interface Tag {
  id: string;
  name: string;
  color: string; // HEX
}

// settings.json(ブートストラップ層、tauri-plugin-store)
export interface BootstrapSettings {
  dbPath: string;
}

// DB内 settings テーブル(アプリ設定層)
export interface AppSettings {
  statusColors: Record<Status, string>;
  archiveAfterHours: number;
  theme: "light" | "dark" | "system";
  quickAddHotkey: string; // 変更UIはフェーズ3以降(変更時は再起動が必要)
  closeToTray: boolean;
  notifyTime: string; // 'HH:mm' 期限通知の発火時刻
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
  closeToTray: true,
  notifyTime: "09:00",
  backupGenerations: 3,
  backupDir: null,
};
