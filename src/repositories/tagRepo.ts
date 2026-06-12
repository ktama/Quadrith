import { getDb } from "../lib/db";
import { err, ok, type Result } from "../lib/result";
import type { Tag } from "../types/models";

export async function findAll(): Promise<Result<Tag[]>> {
  try {
    const db = await getDb();
    const rows = await db.select<Tag[]>(`SELECT id, name, color FROM tags ORDER BY name`);
    return ok(rows);
  } catch (e) {
    return err("DB_READ", "タグの読み込みに失敗しました", e);
  }
}

export async function create(name: string, color: string): Promise<Result<Tag>> {
  try {
    const db = await getDb();
    const tag: Tag = { id: crypto.randomUUID(), name, color };
    await db.execute(`INSERT INTO tags (id, name, color) VALUES (?, ?, ?)`, [
      tag.id,
      tag.name,
      tag.color,
    ]);
    return ok(tag);
  } catch (e) {
    return err("DB_WRITE", "タグの作成に失敗しました(名前の重複の可能性)", e);
  }
}

export async function setTaskTags(taskId: string, tagIds: string[]): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(`DELETE FROM task_tags WHERE task_id = ?`, [taskId]);
    for (const tagId of tagIds) {
      await db.execute(`INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)`, [taskId, tagId]);
    }
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "タグの設定に失敗しました", e);
  }
}
