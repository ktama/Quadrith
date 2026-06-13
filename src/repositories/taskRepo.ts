// tasks テーブルの CRUD(設計書 §4.2)
// 例外は throw せず Result<T> で返す(設計書 §7)。

import { getDb } from "../lib/db";
import { err, ok, type Result } from "../lib/result";
import type { Status, Task } from "../types/models";

interface TaskRow {
  id: string;
  title: string;
  memo: string;
  importance: number | null;
  urgency: number | null;
  status: Status;
  due_date: string | null;
  review_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  tag_ids: string | null;
}

const SELECT_WITH_TAGS = `
  SELECT t.*,
         (SELECT group_concat(tag_id) FROM task_tags WHERE task_id = t.id) AS tag_ids
  FROM tasks t`;

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    memo: r.memo,
    importance: r.importance,
    urgency: r.urgency,
    status: r.status,
    dueDate: r.due_date,
    reviewAt: r.review_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    deletedAt: r.deleted_at,
    tagIds: r.tag_ids ? r.tag_ids.split(",") : [],
  };
}

export interface CreateTaskInput {
  title: string;
  memo?: string;
  importance?: number | null;
  urgency?: number | null;
  status?: Status;
  dueDate?: string | null;
}

export type TaskPatch = Partial<
  Pick<
    Task,
    "title" | "memo" | "status" | "importance" | "urgency" | "dueDate" | "reviewAt" | "completedAt"
  >
>;

const COLUMN_MAP = {
  title: "title",
  memo: "memo",
  status: "status",
  importance: "importance",
  urgency: "urgency",
  dueDate: "due_date",
  reviewAt: "review_at",
  completedAt: "completed_at",
} as const;

// 論理削除されていない全タスク(アーカイブ済み含む)。
// アクティブ/アーカイブの振り分けは表示時に行う(設計書 §5.4)。
export async function findAllAlive(): Promise<Result<Task[]>> {
  try {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>(
      `${SELECT_WITH_TAGS} WHERE t.deleted_at IS NULL ORDER BY t.created_at`,
    );
    return ok(rows.map(rowToTask));
  } catch (e) {
    return err("DB_READ", "タスクの読み込みに失敗しました", e);
  }
}

// 全タスク(論理削除分を含む)。エクスポート用。
export async function findAll(): Promise<Result<Task[]>> {
  try {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>(`${SELECT_WITH_TAGS} ORDER BY t.created_at`);
    return ok(rows.map(rowToTask));
  } catch (e) {
    return err("DB_READ", "エクスポート用データの読み込みに失敗しました", e);
  }
}

export async function create(input: CreateTaskInput): Promise<Result<Task>> {
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    const task: Task = {
      id: crypto.randomUUID(),
      title: input.title,
      memo: input.memo ?? "",
      importance: input.importance ?? null,
      urgency: input.urgency ?? null,
      status: input.status ?? "todo",
      dueDate: input.dueDate ?? null,
      reviewAt: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      deletedAt: null,
      tagIds: [],
    };
    await db.execute(
      `INSERT INTO tasks
         (id, title, memo, importance, urgency, status,
          due_date, review_at, created_at, updated_at, completed_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      [
        task.id,
        task.title,
        task.memo,
        task.importance,
        task.urgency,
        task.status,
        task.dueDate,
        task.reviewAt,
        task.createdAt,
        task.updatedAt,
      ],
    );
    return ok(task);
  } catch (e) {
    return err("DB_WRITE", "タスクの作成に失敗しました", e);
  }
}

export async function update(id: string, patch: TaskPatch): Promise<Result<void>> {
  try {
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of Object.entries(COLUMN_MAP)) {
      if (key in patch) {
        sets.push(`${column} = ?`);
        values.push(patch[key as keyof TaskPatch]);
      }
    }
    if (sets.length === 0) return ok(undefined);
    sets.push("updated_at = ?");
    values.push(new Date().toISOString(), id);

    const db = await getDb();
    await db.execute(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, values);
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "タスクの更新に失敗しました", e);
  }
}

// ドラッグ確定(pointerup)時専用。ドラッグ中は呼ばないこと(設計書 §4.2)。
export async function updatePosition(
  id: string,
  importance: number | null,
  urgency: number | null,
): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(`UPDATE tasks SET importance = ?, urgency = ?, updated_at = ? WHERE id = ?`, [
      importance,
      urgency,
      new Date().toISOString(),
      id,
    ]);
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "位置の保存に失敗しました", e);
  }
}

export async function softDelete(id: string): Promise<Result<void>> {
  try {
    const db = await getDb();
    const now = new Date().toISOString();
    await db.execute(`UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ?`, [now, now, id]);
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "タスクの削除に失敗しました", e);
  }
}

export async function restore(id: string): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(`UPDATE tasks SET deleted_at = NULL, updated_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      id,
    ]);
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "タスクの復元に失敗しました", e);
  }
}

// ごみ箱(論理削除済み)の一覧。削除日時の新しい順。
export async function findTrashed(): Promise<Result<Task[]>> {
  try {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>(
      `${SELECT_WITH_TAGS} WHERE t.deleted_at IS NOT NULL ORDER BY t.deleted_at DESC`,
    );
    return ok(rows.map(rowToTask));
  } catch (e) {
    return err("DB_READ", "ごみ箱の読み込みに失敗しました", e);
  }
}

// ごみ箱からの完全削除(物理削除)。
export async function purge(id: string): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(`DELETE FROM task_tags WHERE task_id = ?`, [id]);
    await db.execute(`DELETE FROM tasks WHERE id = ?`, [id]);
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "完全削除に失敗しました", e);
  }
}

// 論理削除から30日経過したレコードを物理削除する(起動時に呼ぶ)。
// plugin-sql は接続プールを使うため PRAGMA foreign_keys に頼らず task_tags を明示削除する。
export async function purgeExpired(): Promise<Result<number>> {
  try {
    const db = await getDb();
    const cutoff = new Date(Date.now() - 30 * 24 * 3_600_000).toISOString();
    await db.execute(
      `DELETE FROM task_tags WHERE task_id IN
         (SELECT id FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at <= ?)`,
      [cutoff],
    );
    const result = await db.execute(
      `DELETE FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at <= ?`,
      [cutoff],
    );
    return ok(result.rowsAffected);
  } catch (e) {
    return err("DB_WRITE", "期限切れレコードの削除に失敗しました", e);
  }
}
