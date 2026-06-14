// エクスポートの保存処理(仕様書 フェーズ3)
// DB から全データを取得 → JSON/CSV へ整形(export.ts)→ 保存ダイアログで
// パスを選ばせ、Rust の save_text_file コマンドで書き込む。
// CSV は Excel が UTF-8 を正しく解釈できるよう BOM を付与する。

import { save } from "@tauri-apps/plugin-dialog";
import * as tagRepo from "../repositories/tagRepo";
import * as taskRepo from "../repositories/taskRepo";
import * as templateRepo from "../repositories/templateRepo";
import { buildCsv, buildJson } from "./export";
import { saveTextFile } from "./fsops";
import { todayLocal } from "./notifications";
import { err, ok, type Result } from "./result";

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
