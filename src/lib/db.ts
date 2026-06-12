// DB接続マネージャ(設計書 §4.1)
// 唯一の DB 接続保持者。他モジュールは必ず getDb() 経由でアクセスする。
// DBパス切替(switchDbPath)はフェーズ2の設定画面と同時に実装する。

import Database from "@tauri-apps/plugin-sql";
import { load as loadStore } from "@tauri-apps/plugin-store";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir } from "@tauri-apps/plugin-fs";
import { applyMigrations } from "./migrations";
import { backupBeforeOpen } from "./backup";
import { DEFAULT_APP_SETTINGS } from "../types/models";

let db: Database | null = null;
let opening: Promise<Database> | null = null;

export function getDb(): Promise<Database> {
  if (db) return Promise.resolve(db);
  if (!opening) opening = openDb();
  return opening;
}

async function openDb(): Promise<Database> {
  const path = await resolveDbPath();

  // マイグレーション前の必須バックアップを兼ねる(仕様書 §7.4)
  await backupBeforeOpen(path, DEFAULT_APP_SETTINGS.backupGenerations);

  const loaded = await Database.load(`sqlite:${path}`);
  await applyMigrations(loaded);
  db = loaded;
  return loaded;
}

// ブートストラップ設定(settings.json)から DB パスを取得。未設定なら既定値を書き込む。
// settings.json 自体は %APPDATA%/<identifier>/ 固定(仕様書 §7.1)。
async function resolveDbPath(): Promise<string> {
  const dataDir = await appDataDir();
  if (!(await exists(dataDir))) {
    await mkdir(dataDir, { recursive: true });
  }
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  let dbPath = await store.get<string>("dbPath");
  if (!dbPath) {
    dbPath = await join(dataDir, "tasks.db");
    await store.set("dbPath", dbPath);
  }
  return dbPath;
}

export async function closeDb(): Promise<void> {
  if (!db) return;
  // -wal/-shm を単一ファイル化してから閉じる(ファイル移動・コピーを安全にするため)
  await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  await db.close();
  db = null;
  opening = null;
}
