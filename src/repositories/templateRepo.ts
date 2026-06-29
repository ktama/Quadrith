// recurring_templates / template_tags の CRUD(仕様 §4.7)。
// 例外は throw せず Result<T> で返す(設計書 §7)。
// byweekday は '1,3,5' の TEXT、active は INTEGER(0/1)で保存する。

import { getDb } from "../lib/db";
import { err, ok, type Result } from "../lib/result";
import type { EffortSize, RecurFreq, RecurringTemplate } from "../types/models";

interface TemplateRow {
  id: string;
  title: string;
  memo: string;
  importance: number | null;
  urgency: number | null;
  freq: RecurFreq;
  interval: number;
  byweekday: string | null;
  bymonthday: number | null;
  anchor_date: string;
  next_due: string;
  active: number;
  created_at: string;
  updated_at: string;
  category: string | null;
  effort_size: EffortSize | null;
  tag_ids: string | null;
}

const SELECT_WITH_TAGS = `
  SELECT t.*,
         (SELECT group_concat(tag_id) FROM template_tags WHERE template_id = t.id) AS tag_ids
  FROM recurring_templates t`;

function rowToTemplate(r: TemplateRow): RecurringTemplate {
  return {
    id: r.id,
    title: r.title,
    memo: r.memo,
    importance: r.importance,
    urgency: r.urgency,
    freq: r.freq,
    interval: r.interval,
    byweekday: r.byweekday
      ? r.byweekday.split(",").map(Number).filter((n) => !Number.isNaN(n))
      : [],
    bymonthday: r.bymonthday,
    anchorDate: r.anchor_date,
    nextDue: r.next_due,
    active: r.active !== 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    category: r.category,
    effortSize: r.effort_size,
    tagIds: r.tag_ids ? r.tag_ids.split(",") : [],
  };
}

export async function findAll(): Promise<Result<RecurringTemplate[]>> {
  try {
    const db = await getDb();
    const rows = await db.select<TemplateRow[]>(`${SELECT_WITH_TAGS} ORDER BY t.created_at`);
    return ok(rows.map(rowToTemplate));
  } catch (e) {
    return err("DB_READ", "繰り返し設定の読み込みに失敗しました", e);
  }
}

export async function create(t: RecurringTemplate): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(
      `INSERT INTO recurring_templates
         (id, title, memo, importance, urgency, freq, interval, byweekday, bymonthday,
          anchor_date, next_due, active, created_at, updated_at, category, effort_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.title,
        t.memo,
        t.importance,
        t.urgency,
        t.freq,
        t.interval,
        t.byweekday.length ? t.byweekday.join(",") : null,
        t.bymonthday,
        t.anchorDate,
        t.nextDue,
        t.active ? 1 : 0,
        t.createdAt,
        t.updatedAt,
        t.category,
        t.effortSize,
      ],
    );
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "繰り返し設定の作成に失敗しました", e);
  }
}

// ひな型の編集(タグ以外)。next_due / active も含めて全フィールドを上書きする。
export async function update(t: RecurringTemplate): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(
      `UPDATE recurring_templates SET
         title = ?, memo = ?, importance = ?, urgency = ?, freq = ?, interval = ?,
         byweekday = ?, bymonthday = ?, anchor_date = ?, next_due = ?, active = ?, updated_at = ?,
         category = ?, effort_size = ?
       WHERE id = ?`,
      [
        t.title,
        t.memo,
        t.importance,
        t.urgency,
        t.freq,
        t.interval,
        t.byweekday.length ? t.byweekday.join(",") : null,
        t.bymonthday,
        t.anchorDate,
        t.nextDue,
        t.active ? 1 : 0,
        t.updatedAt,
        t.category,
        t.effortSize,
        t.id,
      ],
    );
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "繰り返し設定の更新に失敗しました", e);
  }
}

// 生成フローでの next_due 前進専用(他フィールドに触れない)。
export async function updateNextDue(
  id: string,
  nextDue: string,
  updatedAt: string = new Date().toISOString(),
): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(
      `UPDATE recurring_templates SET next_due = ?, updated_at = ? WHERE id = ?`,
      [nextDue, updatedAt, id],
    );
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "次回発生日の更新に失敗しました", e);
  }
}

// ひな型削除。template_tags も明示削除(接続プールのため FK CASCADE に頼らない)。
export async function remove(id: string): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(`DELETE FROM template_tags WHERE template_id = ?`, [id]);
    await db.execute(`DELETE FROM recurring_templates WHERE id = ?`, [id]);
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "繰り返し設定の削除に失敗しました", e);
  }
}

export async function setTemplateTags(
  templateId: string,
  tagIds: string[],
): Promise<Result<void>> {
  try {
    const db = await getDb();
    await db.execute(`DELETE FROM template_tags WHERE template_id = ?`, [templateId]);
    for (const tagId of tagIds) {
      await db.execute(`INSERT INTO template_tags (template_id, tag_id) VALUES (?, ?)`, [
        templateId,
        tagId,
      ]);
    }
    return ok(undefined);
  } catch (e) {
    return err("DB_WRITE", "繰り返しのタグ設定に失敗しました", e);
  }
}
