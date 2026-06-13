// バックアップ(仕様書 §7.4、設計書 §5.1)
// - 起動時(backupBeforeOpen): DB を開く前=WAL 非接続なので単純ファイルコピー。
//   強制終了で -wal/-shm が残っている場合に備え3ファイルセットでコピーする。
// - 手動(backupNow): DB を開いた後なので VACUUM INTO で単一ファイルに書き出す
//   (設計書 §5.1 手順4の補足どおり、load 後はコピーではなく VACUUM INTO)。
// ファイル操作は任意パス(Dropbox 等)に対応するため Rust の fsops 経由で行う。

import type Database from "@tauri-apps/plugin-sql";
import { dirname, join } from "@tauri-apps/api/path";
import { fsCopyFile, fsExists, fsListDir, fsMakeDir, fsRemoveFile } from "./fsops";

const BACKUP_FILE_RE = /^tasks_\d{8}_\d{6}\.db$/;

async function resolveBackupDir(dbPath: string, backupDir: string | null): Promise<string> {
  return backupDir ?? (await join(await dirname(dbPath), "backups"));
}

export async function backupBeforeOpen(dbPath: string, generations: number): Promise<void> {
  try {
    if (!(await fsExists(dbPath))) return; // 初回起動(DB未作成)
    const dir = await join(await dirname(dbPath), "backups");
    await fsMakeDir(dir);

    const base = `tasks_${timestamp(new Date())}.db`;
    await fsCopyFile(dbPath, await join(dir, base));
    for (const suffix of ["-wal", "-shm"]) {
      if (await fsExists(dbPath + suffix)) {
        await fsCopyFile(dbPath + suffix, await join(dir, base + suffix));
      }
    }
    await pruneOldBackups(dir, generations);
  } catch (e) {
    // バックアップ失敗でアプリは止めない(設計書 §7: 機能を無効化して継続)
    console.error("startup backup failed:", e);
  }
}

// 設定画面からの手動バックアップ。VACUUM INTO で現在の DB を書き出す。
export async function backupNow(
  db: Database,
  dbPath: string,
  backupDir: string | null,
  generations: number,
): Promise<string> {
  const dir = await resolveBackupDir(dbPath, backupDir);
  await fsMakeDir(dir);
  const target = await join(dir, `tasks_${timestamp(new Date())}.db`);
  // VACUUM INTO はパラメータバインドできないため文字列リテラルで渡す(' をエスケープ)
  await db.execute(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  await pruneOldBackups(dir, generations);
  return target;
}

// 起動時バックアップの保存先(DBと同じフォルダの backups/)にあるバックアップ一覧。
// 新しい順。DB open/マイグレーション失敗時の復元ダイアログ(§7 エラー方針)で使う。
export async function listBackups(dbPath: string): Promise<string[]> {
  const dir = await join(await dirname(dbPath), "backups");
  const names = await fsListDir(dir);
  return names.filter((n) => BACKUP_FILE_RE.test(n)).sort().reverse();
}

// 選んだバックアップで現在のDBファイルを置き換える(§5.1-5)。
// 混入を防ぐため復元先の -wal/-shm を先に削除する。
export async function restoreBackup(dbPath: string, backupName: string): Promise<void> {
  const dir = await join(await dirname(dbPath), "backups");
  await fsRemoveFile(dbPath + "-wal");
  await fsRemoveFile(dbPath + "-shm");
  await fsCopyFile(await join(dir, backupName), dbPath);
}

async function pruneOldBackups(dir: string, keep: number): Promise<void> {
  const names = await fsListDir(dir);
  const bases = names.filter((n) => BACKUP_FILE_RE.test(n)).sort(); // 辞書順 = 時系列順
  const excess = bases.slice(0, Math.max(0, bases.length - Math.max(1, keep)));
  for (const base of excess) {
    for (const suffix of ["", "-wal", "-shm"]) {
      await fsRemoveFile(await join(dir, base + suffix));
    }
  }
}

function timestamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}
