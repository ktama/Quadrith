// 起動時のリカバリ画面(仕様書 §7.4 / §5.1)
// - DbMissingDialog: 保存済みパスにDBが見つからないとき(探す/新規作成/既定に戻す)
// - DbErrorScreen:   DB open/マイグレーション失敗時にバックアップから復元する

import { open } from "@tauri-apps/plugin-dialog";
import type { RecoverMode } from "../../lib/db";

export function DbMissingDialog({
  path,
  busy,
  onRecover,
}: {
  path: string;
  busy: boolean;
  onRecover: (mode: RecoverMode, locatedPath?: string) => void;
}) {
  const locate = async () => {
    const picked = await open({
      title: "DBファイルを選択",
      multiple: false,
      directory: false,
      filters: [{ name: "SQLite DB", extensions: ["db"] }],
    });
    if (typeof picked === "string") onRecover("locate", picked);
  };

  return (
    <div className="h-full flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 shadow">
        <h1 className="text-lg font-bold text-slate-700 dark:text-slate-100 mb-1">
          DBファイルが見つかりません
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-300 break-all mb-4">{path}</p>
        <p className="text-sm text-slate-600 dark:text-slate-200 mb-4">
          クラウド同期フォルダが未同期の可能性があります。どうしますか?
        </p>
        <div className="flex flex-col gap-2">
          <button
            disabled={busy}
            className="text-sm py-2 rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50"
            onClick={() => void locate()}
          >
            ファイルを探す
          </button>
          <button
            disabled={busy}
            className="text-sm py-2 rounded bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 disabled:opacity-50"
            onClick={() => onRecover("createNew")}
          >
            この場所に新規作成する
          </button>
          <button
            disabled={busy}
            className="text-sm py-2 rounded bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 disabled:opacity-50"
            onClick={() => onRecover("resetDefault")}
          >
            既定の場所に戻す
          </button>
        </div>
      </div>
    </div>
  );
}

export function DbErrorScreen({
  message,
  backups,
  busy,
  onRestore,
  onRetry,
}: {
  message: string;
  backups: string[];
  busy: boolean;
  onRestore: (name: string) => void;
  onRetry: () => void;
}) {
  return (
    <div className="h-full flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-900">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 border border-red-200 dark:border-red-900 rounded-lg p-6 shadow">
        <h1 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
          データベースを開けませんでした
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-300 break-all mb-4">{message}</p>

        {backups.length > 0 ? (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-200 mb-2">
              バックアップから復元できます(新しい順):
            </p>
            <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded mb-3">
              {backups.map((name) => (
                <div
                  key={name}
                  className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
                >
                  <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{name}</span>
                  <button
                    disabled={busy}
                    className="text-xs px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white shrink-0 disabled:opacity-50"
                    onClick={() => onRestore(name)}
                  >
                    復元
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-300 mb-3">
            復元できるバックアップが見つかりませんでした。
          </p>
        )}

        <button
          disabled={busy}
          className="w-full text-sm py-2 rounded bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 disabled:opacity-50"
          onClick={onRetry}
        >
          再試行
        </button>
      </div>
    </div>
  );
}
