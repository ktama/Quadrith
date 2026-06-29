// エクスポートの整形(仕様書 フェーズ3、JSON/CSV)
// ここは純粋関数のみ。ファイル保存(ダイアログ + 書込)は exportFile.ts が担う。

import type { RecurringTemplate, Tag, Task } from "../types/models";

export interface ExportBundle {
  tasks: Task[]; // 論理削除分も含む全タスク
  tags: Tag[];
  templates: RecurringTemplate[]; // 定期タスクのひな型
}

export function buildJson(bundle: ExportBundle): string {
  return JSON.stringify(
    {
      app: "Quadrith",
      schemaVersion: 2, // v2: templates(定期タスクのひな型)を追加
      exportedAt: new Date().toISOString(),
      tasks: bundle.tasks,
      tags: bundle.tags,
      templates: bundle.templates,
    },
    null,
    2,
  );
}

const CSV_HEADERS = [
  "id",
  "title",
  "memo",
  "importance",
  "urgency",
  "status",
  "due_date",
  "review_at",
  "created_at",
  "updated_at",
  "last_progress_at",
  "completed_at",
  "deleted_at",
  "template_id",
  "category",
  "effort_size",
  "today_date",
  "tags",
];

// CSV セルのエスケープ(", カンマ, 改行を含むなら "" 囲み)。Redmine 整形でも共用する。
export function csvEscape(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildCsv(bundle: ExportBundle): string {
  const tagName = new Map(bundle.tags.map((t) => [t.id, t.name]));
  const lines = [CSV_HEADERS.join(",")];
  for (const t of bundle.tasks) {
    const tags = t.tagIds.map((id) => tagName.get(id) ?? id).join("|");
    const cells = [
      t.id,
      t.title,
      t.memo,
      t.importance === null ? "" : String(t.importance),
      t.urgency === null ? "" : String(t.urgency),
      t.status,
      t.dueDate ?? "",
      t.reviewAt ?? "",
      t.createdAt,
      t.updatedAt,
      t.lastProgressAt,
      t.completedAt ?? "",
      t.deletedAt ?? "",
      t.templateId ?? "",
      t.category ?? "",
      t.effortSize ?? "",
      t.todayDate ?? "",
      tags,
    ];
    lines.push(cells.map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}
