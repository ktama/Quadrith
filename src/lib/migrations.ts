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
];

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
