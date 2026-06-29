// マイグレーションSQLの検証(設計書 §8 「better-sqlite3 でインメモリ検証」)。
// MIGRATIONS の SQL を実DBエンジン(better-sqlite3)に適用し、スキーマと
// タグ集約クエリ(group_concat)が成立することを確認する。

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS_FOR_TEST } from "./migrations";

let db: Database.Database;

function applyAll(target: Database.Database) {
  for (const m of [...MIGRATIONS_FOR_TEST].sort((a, b) => a.version - b.version)) {
    for (const sql of m.statements) target.exec(sql);
    target.pragma(`user_version = ${m.version}`);
  }
}

beforeEach(() => {
  db = new Database(":memory:");
});
afterEach(() => {
  db.close();
});

describe("migrations", () => {
  it("creates all tables and reaches the latest user_version", () => {
    applyAll(db);
    expect(db.pragma("user_version", { simple: true })).toBe(6);
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
        name: string;
      }[]
    ).map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "tasks",
        "tags",
        "task_tags",
        "settings",
        "recurring_templates",
        "template_tags",
      ]),
    );
  });

  it("adds template_id and recurring tables via the v3 migration", () => {
    applyAll(db);
    const cols = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toContain("template_id");
    // ひな型を1件入れ、freq の CHECK と FK 形が成立すること
    db.prepare(
      `INSERT INTO recurring_templates
         (id,title,memo,importance,urgency,freq,interval,anchor_date,next_due,active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run("tpl-1", "掃除", "", 0.7, 0.3, "weekly", 1, "2026-06-01", "2026-06-15", 1, "n", "n");
    expect(() =>
      db
        .prepare(
          `INSERT INTO recurring_templates
             (id,title,memo,importance,urgency,freq,interval,anchor_date,next_due,active,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run("tpl-bad", "x", "", null, null, "hourly", 1, "n", "n", 1, "n", "n"),
    ).toThrow();
  });

  it("adds last_progress_at via the v2 migration", () => {
    applyAll(db);
    const cols = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toContain("last_progress_at");
  });

  it("adds category to tasks and recurring_templates via the v4 migration", () => {
    applyAll(db);
    const taskCols = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    const tplCols = (
      db.prepare("PRAGMA table_info(recurring_templates)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(taskCols).toContain("category");
    expect(tplCols).toContain("category");
  });

  it("adds effort_size (v5) and today columns (v6) with the size CHECK", () => {
    applyAll(db);
    const taskCols = (db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[]).map(
      (c) => c.name,
    );
    const tplCols = (
      db.prepare("PRAGMA table_info(recurring_templates)").all() as { name: string }[]
    ).map((c) => c.name);
    expect(taskCols).toEqual(expect.arrayContaining(["effort_size", "today_date", "today_order"]));
    expect(tplCols).toContain("effort_size");

    // 有効なサイズは通る
    db.prepare(
      `INSERT INTO tasks (id,title,memo,importance,urgency,status,created_at,updated_at,last_progress_at,effort_size)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run("e-ok", "t", "", null, null, "todo", "n", "n", "n", "L");
    // 範囲外のサイズは CHECK 違反
    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks (id,title,memo,importance,urgency,status,created_at,updated_at,last_progress_at,effort_size)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run("e-bad", "t", "", null, null, "todo", "n", "n", "n", "XXL"),
    ).toThrow();
  });

  it("is idempotent when re-applied (user_version guards)", () => {
    applyAll(db);
    // 既に最新なので、v1 を再実行しても IF NOT EXISTS / ADD COLUMN を踏まない想定
    const current = db.pragma("user_version", { simple: true }) as number;
    for (const m of MIGRATIONS_FOR_TEST) {
      if (m.version <= current) continue;
      for (const sql of m.statements) db.exec(sql);
    }
    expect(db.pragma("user_version", { simple: true })).toBe(6);
  });

  it("enforces the importance/urgency null-together CHECK", () => {
    applyAll(db);
    const insert = db.prepare(
      `INSERT INTO tasks (id,title,memo,importance,urgency,status,created_at,updated_at,last_progress_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    // 片方だけ NULL は CHECK 違反
    expect(() =>
      insert.run("x", "t", "", 0.5, null, "todo", "n", "n", "n"),
    ).toThrow();
  });

  it("aggregates tags with group_concat (SELECT_WITH_TAGS shape)", () => {
    applyAll(db);
    db.prepare(
      `INSERT INTO tasks (id,title,memo,importance,urgency,status,created_at,updated_at,last_progress_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run("task-1", "T", "", 0.8, 0.2, "todo", "n", "n", "n");
    db.prepare(`INSERT INTO tags (id,name,color) VALUES (?,?,?)`).run("tag-1", "仕事", "#fff");
    db.prepare(`INSERT INTO tags (id,name,color) VALUES (?,?,?)`).run("tag-2", "家", "#000");
    db.prepare(`INSERT INTO task_tags (task_id,tag_id) VALUES (?,?)`).run("task-1", "tag-1");
    db.prepare(`INSERT INTO task_tags (task_id,tag_id) VALUES (?,?)`).run("task-1", "tag-2");

    const row = db
      .prepare(
        `SELECT t.id,
                (SELECT group_concat(tag_id) FROM task_tags WHERE task_id = t.id) AS tag_ids
         FROM tasks t WHERE t.id = ?`,
      )
      .get("task-1") as { id: string; tag_ids: string };
    expect(row.tag_ids.split(",").sort()).toEqual(["tag-1", "tag-2"]);
  });

  it("rejects an invalid status value", () => {
    applyAll(db);
    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks (id,title,memo,importance,urgency,status,created_at,updated_at,last_progress_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run("y", "t", "", null, null, "bogus", "n", "n", "n"),
    ).toThrow();
  });
});
