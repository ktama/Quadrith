// Redmine インポート用 CSV の整形(仕様 §4.8 / 設計 §11)。
// ここは純粋関数のみ(vitest 対象)。ファイル保存・設定読み込みは exportFile.ts が担う。
//
// 出力対象は「未完了 × 期間内」。繰り返しは期間内の発生日を展開し、
// 既に生成済みの実体がある発生日はスキップして二重計上を防ぐ(実体優先 + 欠損補完)。
// 重要度×緊急度は象限へ落とし、Redmine の優先度(1軸)へ圧縮する。

import { csvEscape } from "./export";
import { quadrantOf } from "./quadrant";
import { addDaysStr, nextOnOrAfter } from "./recurrence";
import {
  DEFAULT_REDMINE_MAPPING,
  type RedmineMapping,
  type RedminePriorityKey,
  type Status,
  type RecurringTemplate,
  type Tag,
  type Task,
} from "../types/models";

export interface Period {
  from: string; // 'YYYY-MM-DD'(含む)
  to: string; // 'YYYY-MM-DD'(含む)
}

export type PriorityKey = RedminePriorityKey;

// マッピング(設定値)+ トラッカー(settings.json)を合わせた実行時の構成。
export interface RedmineExportConfig extends RedmineMapping {
  tracker: string; // settings.json の redmineTracker(既定 'タスク')
}

// 1チケット相当の中間表現(マッピング適用前の生データ)。
export interface RedmineRow {
  title: string;
  memo: string;
  status: Status;
  priorityKey: PriorityKey;
  dueDate: string | null;
  startDate: string | null; // 開始日(createdAt の日付)。展開行は null
  category: string | null;
  tagIds: string[];
}

// createdAt(ISO UTC)から日付部分(YYYY-MM-DD)を取り出す。
function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

export const DEFAULT_REDMINE_TRACKER = "タスク";

export function defaultRedmineConfig(tracker: string = DEFAULT_REDMINE_TRACKER): RedmineExportConfig {
  return {
    tracker,
    statusMap: { ...DEFAULT_REDMINE_MAPPING.statusMap },
    priorityMap: { ...DEFAULT_REDMINE_MAPPING.priorityMap },
    forceNewStatus: DEFAULT_REDMINE_MAPPING.forceNewStatus,
    includeStartDate: DEFAULT_REDMINE_MAPPING.includeStartDate,
    includeCategory: DEFAULT_REDMINE_MAPPING.includeCategory,
  };
}

const BASE_HEADERS = ["題名", "説明", "トラッカー", "ステータス", "優先度", "期日"];

function priorityKeyOf(importance: number | null, urgency: number | null): PriorityKey {
  if (importance === null || urgency === null) return "inbox";
  return quadrantOf(importance, urgency);
}

// 未完了 = 完了でも論理削除でもない
function isOpen(t: Task): boolean {
  return t.status !== "done" && t.deletedAt === null;
}

function inPeriod(date: string, period: Period): boolean {
  return date >= period.from && date <= period.to;
}

function taskRow(t: Task): RedmineRow {
  return {
    title: t.title,
    memo: t.memo,
    status: t.status,
    priorityKey: priorityKeyOf(t.importance, t.urgency),
    dueDate: t.dueDate,
    startDate: isoDate(t.createdAt),
    category: t.category,
    tagIds: t.tagIds,
  };
}

function templateRow(tpl: RecurringTemplate, due: string): RedmineRow {
  return {
    title: tpl.title,
    memo: tpl.memo,
    status: "todo", // ひな型展開行は新規として出力
    priorityKey: priorityKeyOf(tpl.importance, tpl.urgency),
    dueDate: due,
    startDate: null, // 発生分には作成日がないので空
    category: tpl.category,
    tagIds: tpl.tagIds,
  };
}

// 期間内の出力行を決定する(実体優先 + ひな型の欠損補完)。
export function selectRedmineRows(
  tasks: Task[],
  templates: RecurringTemplate[],
  period: Period,
): RedmineRow[] {
  const rows: RedmineRow[] = [];
  // テンプレ由来で実体が既にある発生日(`templateId\ndueDate` をキーに)
  const materialized = new Set<string>();

  for (const t of tasks) {
    if (!isOpen(t)) continue;
    if (t.dueDate === null || !inPeriod(t.dueDate, period)) continue;
    rows.push(taskRow(t));
    if (t.templateId !== null) materialized.add(`${t.templateId}\n${t.dueDate}`);
  }

  for (const tpl of templates) {
    if (!tpl.active) continue;
    let cursor = period.from;
    for (let i = 0; i < 10_000; i++) {
      const occ = nextOnOrAfter(tpl, cursor);
      if (occ === null || occ > period.to) break;
      if (!materialized.has(`${tpl.id}\n${occ}`)) rows.push(templateRow(tpl, occ));
      cursor = addDaysStr(occ, 1);
    }
  }

  return rows;
}

// 説明にタグを補記する(タグがある場合のみ)。
function describe(memo: string, tagIds: string[], tagName: Map<string, string>): string {
  if (tagIds.length === 0) return memo;
  const names = tagIds.map((id) => tagName.get(id) ?? id).join(", ");
  const note = `タグ: ${names}`;
  return memo ? `${memo}\n\n---\n${note}` : note;
}

export function buildRedmineCsv(
  rows: RedmineRow[],
  tags: Tag[],
  config: RedmineExportConfig,
): string {
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const headers = [...BASE_HEADERS];
  if (config.includeStartDate) headers.push("開始日");
  if (config.includeCategory) headers.push("カテゴリ");

  const lines = [headers.join(",")];
  for (const r of rows) {
    // Redmine ワークフロー上、新規チケットに「新規」以外を設定できない環境向け
    const status = config.forceNewStatus ? config.statusMap.todo : config.statusMap[r.status];
    const cells = [
      r.title,
      describe(r.memo, r.tagIds, tagName),
      config.tracker,
      status,
      config.priorityMap[r.priorityKey],
      r.dueDate ?? "",
    ];
    if (config.includeStartDate) cells.push(r.startDate ?? "");
    if (config.includeCategory) cells.push(r.category ?? "");
    lines.push(cells.map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}
