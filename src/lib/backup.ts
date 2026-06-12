// 起動時の自動バックアップ(仕様書 §7.4、設計書 §5.1 手順4)
// DB を開く前(= 本プロセスが WAL 非接続の状態)に呼ぶこと。
// 通常終了時は WAL がチェックポイント済みで単一ファイルだが、強制終了などで
// -wal/-shm が残っている場合に備えて3ファイルセットでコピーする(仕様書 §7.4)。
// コピーした -wal は、バックアップ DB を開いた時点で SQLite が自動リカバリする。
// load 後の手動バックアップ(フェーズ2の設定画面)では VACUUM INTO を使うこと。

import { copyFile, exists, mkdir, readDir, remove } from "@tauri-apps/plugin-fs";
import { dirname, join } from "@tauri-apps/api/path";

const BACKUP_FILE_RE = /^tasks_\d{8}_\d{6}\.db$/;

export async function backupBeforeOpen(dbPath: string, generations: number): Promise<void> {
  try {
    if (!(await exists(dbPath))) return; // 初回起動(DB未作成)
    const backupDir = await join(await dirname(dbPath), "backups");
    await mkdir(backupDir, { recursive: true });

    const base = `tasks_${timestamp(new Date())}.db`;
    await copyFile(dbPath, await join(backupDir, base));
    for (const suffix of ["-wal", "-shm"]) {
      if (await exists(dbPath + suffix)) {
        await copyFile(dbPath + suffix, await join(backupDir, base + suffix));
      }
    }
    await pruneOldBackups(backupDir, generations);
  } catch (e) {
    // バックアップ失敗でアプリは止めない(設計書 §7: 機能を無効化して継続)
    console.error("startup backup failed:", e);
  }
}

async function pruneOldBackups(backupDir: string, keep: number): Promise<void> {
  const entries = await readDir(backupDir);
  const bases = entries
    .filter((e) => e.isFile && BACKUP_FILE_RE.test(e.name))
    .map((e) => e.name)
    .sort(); // タイムスタンプ形式なので辞書順 = 時系列順
  const excess = bases.slice(0, Math.max(0, bases.length - Math.max(1, keep)));
  for (const base of excess) {
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = await join(backupDir, base + suffix);
      if (await exists(path)) await remove(path);
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
