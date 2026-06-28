// DB接続マネージャ(設計書 §4.1)
// 唯一の DB 接続保持者。他モジュールは必ず getDb() 経由でアクセスする。
// DBパスの保存先(settings.json)は %APPDATA%/<identifier>/ 固定(仕様書 §7.1)。
// ファイル操作は任意パス(Dropbox 等)対応のため Rust の fsops 経由で行う。

import Database from "@tauri-apps/plugin-sql";
import { load as loadStore } from "@tauri-apps/plugin-store";
import { appDataDir, dirname, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { applyMigrations } from "./migrations";
import { backupBeforeOpen } from "./backup";
import { fsCopyFile, fsExists, fsMakeDir, fsRemoveFile } from "./fsops";
import { err, ok, type Result } from "./result";
import { planSwitch, type SwitchMode } from "./switchPlan";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "../types/models";

export type { SwitchMode } from "./switchPlan";

let db: Database | null = null;
let opening: Promise<Database> | null = null;
let currentPath: string | null = null;

export function getDb(): Promise<Database> {
  if (db) return Promise.resolve(db);
  // 失敗した open をキャッシュしないことで、復元・パス変更後の再試行で開き直せる
  if (!opening) opening = openDb().catch((e) => {
    opening = null;
    throw e;
  });
  return opening;
}

// 現在開いている DB ファイルのパス(未接続なら null)。設定画面の表示用。
export function getDbPath(): string | null {
  return currentPath;
}

async function openDb(): Promise<Database> {
  const path = await resolveDbPath();

  // マイグレーション前の必須バックアップを兼ねる(仕様書 §7.4)。
  // クイック追加ウィンドウからの getDb はメイン側で DB 接続済み(WAL 稼働中)の
  // 可能性が高く、ファイルコピーが安全でないためメインウィンドウのみ実行する。
  // 世代数は DB を開く前に必要なため settings.json(ブートストラップ層)に持つ。
  if (getCurrentWindow().label === "main") {
    await backupBeforeOpen(path, await getBackupDir(), await readBackupGenerations());
  }

  const loaded = await Database.load(`sqlite:${path}`);
  await applyMigrations(loaded);
  db = loaded;
  currentPath = path;
  return loaded;
}

async function readBackupGenerations(): Promise<number> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  const n = await store.get<number>("backupGenerations");
  return typeof n === "number" && n >= 1 ? n : DEFAULT_APP_SETTINGS.backupGenerations;
}

// バックアップ保存先。設定の backupDir(ブートストラップ層にミラー)があればそれを、
// 無ければ DB と同じフォルダの backups/ を返す。起動時・手動・復元で共通に使う。
export async function getBackupDir(): Promise<string> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  const custom = await store.get<string | null>("backupDir");
  if (custom) return custom;
  return join(await dirname(await getStoredDbPath()), "backups");
}

// バックアップの世代数・保存先・テーマは「DB を開く前」や「DB を開けない時」に
// 必要になるため、DB 内 settings に加えて settings.json(ブートストラップ層)へ
// もミラーする。ブートストラップ層が正となる。
export async function persistBackupGenerations(n: number): Promise<void> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  await store.set("backupGenerations", n);
  await store.save();
}

export async function persistBackupDir(dir: string | null): Promise<void> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  await store.set("backupDir", dir);
  await store.save();
}

// テーマは起動時のチラつき(FOUC)防止のため DB ロード前に読めるようミラーする。
export async function persistThemePref(theme: AppSettings["theme"]): Promise<void> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  await store.set("theme", theme);
  await store.save();
}

export async function readThemePref(): Promise<AppSettings["theme"] | null> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  const t = await store.get<string>("theme");
  return t === "light" || t === "dark" || t === "system" ? t : null;
}

// Redmine エクスポートのトラッカー名(仕様 §4.8)。Redmine 環境ごとに異なり、不一致だと
// インポート全体が失敗するため、設定 UI を待たず settings.json で直接変更できるよう
// ブートストラップ層に持つ。未設定なら 'タスク'。
export async function readRedmineTracker(): Promise<string> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  const t = await store.get<string>("redmineTracker");
  return typeof t === "string" && t.trim() !== "" ? t : "タスク";
}

export async function persistRedmineTracker(tracker: string): Promise<void> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  await store.set("redmineTracker", tracker.trim());
  await store.save();
}

// ブートストラップ設定(settings.json)から DB パスを取得。未設定なら既定値を書き込む。
async function resolveDbPath(): Promise<string> {
  const dataDir = await appDataDir();
  await fsMakeDir(dataDir);
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  let dbPath = await store.get<string>("dbPath");
  if (!dbPath) {
    dbPath = await join(dataDir, "tasks.db");
    await store.set("dbPath", dbPath);
  }
  return dbPath;
}

// settings.json に保存された(または既定の)DBパス。DB未接続でも参照できる。
// 復元ダイアログ(open 失敗時)が対象パスを知るために使う。
export async function getStoredDbPath(): Promise<string> {
  return resolveDbPath();
}

export async function defaultDbPath(): Promise<string> {
  return join(await appDataDir(), "tasks.db");
}

export type DbAvailability = { status: "ready" } | { status: "missing"; path: string };

// 起動時のDBファイル存在チェック(仕様書 §7.4 / §5.1-3)。
// 保存済みパスが指すファイルが無ければ「探す/新規作成/既定に戻す」を促すため missing を返す。
// (初回起動でパス未設定の場合は既定パスを新規作成する正常系なので ready)
export async function checkDbAvailability(): Promise<DbAvailability> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  const stored = await store.get<string>("dbPath");
  if (!stored) return { status: "ready" }; // 初回起動 → 既定パスを作成
  if (await fsExists(stored)) return { status: "ready" };
  return { status: "missing", path: stored };
}

export type RecoverMode = "locate" | "createNew" | "resetDefault";

// §7.4 のDB未検出ダイアログの選択を settings.json に反映する。
//   locate      … 既存DBの場所を選び直す(locatedPath)
//   createNew   … 保存済みパスに空のDBを作る(load 時に作成されるので変更不要)
//   resetDefault… 既定パス(%APPDATA%/tasks.db)に戻す
export async function recoverDbPath(mode: RecoverMode, locatedPath?: string): Promise<void> {
  if (mode === "createNew") return;
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  if (mode === "locate" && locatedPath) {
    await store.set("dbPath", locatedPath);
  } else if (mode === "resetDefault") {
    await store.set("dbPath", await defaultDbPath());
  }
  await store.save();
}

async function persistDbPath(path: string): Promise<void> {
  const store = await loadStore("settings.json", { autoSave: true, defaults: {} });
  await store.set("dbPath", path);
  await store.save();
}

export async function closeDb(): Promise<void> {
  if (!db) return;
  // -wal/-shm を単一ファイル化してから閉じる(ファイル移動・コピーを安全にするため)
  await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  await db.close();
  db = null;
  opening = null;
}

// DBパス切替(仕様書 §7.3 / 設計書 §4.1)。モード別のファイル操作は planSwitch が決める。
//   move        … 現在のデータを新パスへコピーして移動(成功後に旧ファイル削除)
//   createNew   … 新パスに空の DB を作成(現在のデータは旧パスに残す)
//   openExisting… 新パスにある既存 DB をそのまま開く
//   overwrite   … 新パスの既存 DB を現在のデータで上書き
// 失敗時は旧パスを開き直して自動ロールバックする(仕様書 §7.3-3)。
export async function switchDbPath(newPath: string, mode: SwitchMode): Promise<Result<void>> {
  const oldPath = currentPath ?? (await resolveDbPath());
  if (newPath === oldPath) return ok(undefined);
  const plan = planSwitch(mode);

  try {
    // 1. 旧 DB をフラッシュして閉じる(チェックポイントで単一ファイル化)
    await closeDb();

    // 2. モードに応じたファイル操作
    if (plan.removeExistingNew) {
      await fsRemoveFile(newPath);
      await fsRemoveFile(newPath + "-wal");
      await fsRemoveFile(newPath + "-shm");
    }
    if (plan.copyOldToNew) {
      await fsCopyFile(oldPath, newPath);
    }

    // 3. 新パスで開く → マイグレーション自動適用
    const loaded = await Database.load(`sqlite:${newPath}`);
    await applyMigrations(loaded);
    db = loaded;
    currentPath = newPath;
    opening = null;

    // 5. settings.json を更新
    await persistDbPath(newPath);

    // move 成功時のみ旧ファイルを削除(3ファイルセット)
    if (plan.deleteOldAfter) {
      await fsRemoveFile(oldPath);
      await fsRemoveFile(oldPath + "-wal");
      await fsRemoveFile(oldPath + "-shm");
    }
    return ok(undefined);
  } catch (e) {
    // 4. ロールバック: 旧パスを開き直す
    try {
      if (await fsExists(oldPath)) {
        const reopened = await Database.load(`sqlite:${oldPath}`);
        await applyMigrations(reopened);
        db = reopened;
        currentPath = oldPath;
        opening = null;
      }
    } catch (rollbackErr) {
      console.error("DBパス切替のロールバックに失敗:", rollbackErr);
    }
    return err("DB_OPEN", "DBパスの切替に失敗しました(旧パスに戻しました)", e);
  }
}
