// スキーママイグレーション基盤(仕様書 §3)
// PRAGMA user_version でバージョン管理し、起動時に差分のみ順次適用する。
//
// 設計書では Rust 側(tauri-plugin-sql の add_migrations)に置く案だったが、
// plugin-sql のマイグレーションは「接続文字列単位」で静的に登録する仕組みのため、
// ユーザーが任意に変更できる DB パス(仕様 §6, §7)に追従できない。
// 「ロジックは TS 側に寄せる」方針(設計書 §1)に従い、TS 側で実装する。
//
// ルール: 過去のマイグレーションは絶対に書き換えない。変更は version を増やして追記する。

import type Database from "@tauri-apps/plugin-sql";

interface Migration {
  version: number;
  description: string;
  statements: string[];
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "initial schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS tasks (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL,
        memo         TEXT NOT NULL DEFAULT '',
        importance   REAL,
        urgency      REAL,
        status       TEXT NOT NULL
                     CHECK (status IN ('todo','doing','pending','waiting','done')),
        due_date     TEXT,
        review_at    TEXT,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        completed_at TEXT,
        deleted_at   TEXT,
        CHECK ((importance IS NULL) = (urgency IS NULL))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status) WHERE deleted_at IS NULL`,
      `CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date) WHERE deleted_at IS NULL`,
      `CREATE TABLE IF NOT EXISTS tags (
        id    TEXT PRIMARY KEY,
        name  TEXT NOT NULL UNIQUE,
        color TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS task_tags (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, tag_id)
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    description: "add last_progress_at for neglect reminder",
    statements: [
      // 「進捗」のあった日時。放置リマインドの基準(ドラッグやタグ編集では更新しない)
      `ALTER TABLE tasks ADD COLUMN last_progress_at TEXT`,
      // 既存行は更新日時で初期化する
      `UPDATE tasks SET last_progress_at = updated_at WHERE last_progress_at IS NULL`,
    ],
  },
  {
    version: 3,
    description: "add recurring task templates",
    statements: [
      // 生成元のひな型(NULL = 通常タスク)。🔁表示・シリーズ追跡用
      `ALTER TABLE tasks ADD COLUMN template_id TEXT`,
      // 定期タスクのひな型。発生日に通常 tasks を1件生成する(仕様 §4.7)
      `CREATE TABLE IF NOT EXISTS recurring_templates (
        id           TEXT PRIMARY KEY,
        title        TEXT NOT NULL,
        memo         TEXT NOT NULL DEFAULT '',
        importance   REAL,
        urgency      REAL,
        freq         TEXT NOT NULL
                     CHECK (freq IN ('daily','weekly','monthly','yearly')),
        interval     INTEGER NOT NULL DEFAULT 1,
        byweekday    TEXT,
        bymonthday   INTEGER,
        anchor_date  TEXT NOT NULL,
        next_due     TEXT NOT NULL,
        active       INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL,
        updated_at   TEXT NOT NULL,
        CHECK ((importance IS NULL) = (urgency IS NULL))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_templates_active
         ON recurring_templates(active, next_due)`,
      `CREATE TABLE IF NOT EXISTS template_tags (
        template_id TEXT NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
        tag_id      TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (template_id, tag_id)
      )`,
    ],
  },
  {
    version: 4,
    description: "add category for Redmine export",
    statements: [
      // 任意のカテゴリ(NULL=未設定)。Redmine の「カテゴリ」列に対応(仕様 §4.8)
      `ALTER TABLE tasks ADD COLUMN category TEXT`,
      // ひな型にも持たせ、生成される実体・エクスポートの展開行へ継承する
      `ALTER TABLE recurring_templates ADD COLUMN category TEXT`,
    ],
  },
];

export const MIGRATIONS_FOR_TEST = MIGRATIONS;

export async function applyMigrations(db: Database): Promise<void> {
  const rows = await db.select<{ user_version: number }[]>("PRAGMA user_version");
  const current = rows[0]?.user_version ?? 0;

  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    for (const sql of m.statements) {
      await db.execute(sql);
    }
    await db.execute(`PRAGMA user_version = ${m.version}`);
  }
}
