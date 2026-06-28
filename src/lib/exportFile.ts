// エクスポートの保存処理(仕様書 フェーズ3)
// DB から全データを取得 → JSON/CSV へ整形(export.ts)→ 保存ダイアログで
// パスを選ばせ、Rust の save_text_file コマンドで書き込む。
// CSV は Excel が UTF-8 を正しく解釈できるよう BOM を付与する。

import { confirm, save } from "@tauri-apps/plugin-dialog";
import * as tagRepo from "../repositories/tagRepo";
import * as taskRepo from "../repositories/taskRepo";
import * as templateRepo from "../repositories/templateRepo";
import { readRedmineTracker } from "./db";
import { buildCsv, buildJson } from "./export";
import { saveTextFile } from "./fsops";
import { todayLocal } from "./notifications";
import { buildRedmineCsv, type Period, selectRedmineRows } from "./redmineExport";
import { err, ok, type Result } from "./result";
import type { RedmineMapping } from "../types/models";

export type ExportFormat = "json" | "csv";

// 成功時は保存先パス、ユーザーがキャンセルしたら null を返す。
export async function exportData(format: ExportFormat): Promise<Result<string | null>> {
  const tasksRes = await taskRepo.findAll();
  if (!tasksRes.ok) return tasksRes;
  const tagsRes = await tagRepo.findAll();
  if (!tagsRes.ok) return tagsRes;
  const templatesRes = await templateRepo.findAll();
  if (!templatesRes.ok) return templatesRes;

  const bundle = {
    tasks: tasksRes.value,
    tags: tagsRes.value,
    templates: templatesRes.value,
  };
  const body = format === "json" ? buildJson(bundle) : `﻿${buildCsv(bundle)}`;

  try {
    const path = await save({
      defaultPath: `quadrith_${todayLocal()}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (!path) return ok(null);
    await saveTextFile(path, body);
    return ok(path);
  } catch (e) {
    return err("FS", "エクスポートに失敗しました", e);
  }
}

// Redmine 取込用 CSV のエクスポート(仕様 §4.8 / 設計 §11)。
// 対象0件は中断、大量(1000行超)は確認を挟む。トラッカーは settings.json から読む。
export type RedmineExportOutcome =
  | { kind: "saved"; path: string; count: number }
  | { kind: "empty" }
  | { kind: "cancelled" };

const REDMINE_CONFIRM_THRESHOLD = 1000;

export async function exportRedmineCsv(
  period: Period,
  mapping: RedmineMapping,
): Promise<Result<RedmineExportOutcome>> {
  const tasksRes = await taskRepo.findAll();
  if (!tasksRes.ok) return tasksRes;
  const templatesRes = await templateRepo.findAll();
  if (!templatesRes.ok) return templatesRes;
  const tagsRes = await tagRepo.findAll();
  if (!tagsRes.ok) return tagsRes;

  const rows = selectRedmineRows(tasksRes.value, templatesRes.value, period);
  if (rows.length === 0) return ok({ kind: "empty" });

  try {
    if (rows.length > REDMINE_CONFIRM_THRESHOLD) {
      const proceed = await confirm(`${rows.length} 件をエクスポートします。よろしいですか?`, {
        title: "Redmine エクスポート",
        kind: "warning",
      });
      if (!proceed) return ok({ kind: "cancelled" });
    }

    const tracker = await readRedmineTracker();
    const csv = buildRedmineCsv(rows, tagsRes.value, { tracker, ...mapping });

    const path = await save({
      defaultPath: `quadrith_redmine_${todayLocal()}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return ok({ kind: "cancelled" });
    await saveTextFile(path, `﻿${csv}`); // Excel/Redmine 向けに BOM 付与
    return ok({ kind: "saved", path, count: rows.length });
  } catch (e) {
    return err("FS", "Redmine CSV のエクスポートに失敗しました", e);
  }
}
