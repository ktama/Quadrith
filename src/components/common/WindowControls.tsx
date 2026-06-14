// カスタムタイトルバーのウィンドウ操作(枠なし化に伴う自前の 最小化/最大化/閉じる)。
// 閉じるは OS の close と同じ経路(onCloseRequested → closeToTray 判定)を通す。

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function WindowControls() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void win.isMaximized().then(setMaximized);
    const un = win.onResized(() => void win.isMaximized().then(setMaximized));
    return () => {
      void un.then((f) => f());
    };
  }, [win]);

  const base =
    "w-11 h-full flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors";

  return (
    <div className="flex items-stretch self-stretch">
      <button
        className={`${base} hover:bg-slate-100 dark:hover:bg-slate-700`}
        aria-label="最小化"
        title="最小化"
        onClick={() => void win.minimize()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
          <rect x="1" y="5" width="9" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        className={`${base} hover:bg-slate-100 dark:hover:bg-slate-700`}
        aria-label={maximized ? "元のサイズに戻す" : "最大化"}
        title={maximized ? "元のサイズに戻す" : "最大化"}
        onClick={() => void win.toggleMaximize()}
      >
        {maximized ? (
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" fill="none" stroke="currentColor">
            <rect x="1.5" y="3" width="6" height="6" strokeWidth="1" />
            <path d="M3.5 3V1.5H9.5V7.5H8" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" fill="none" stroke="currentColor">
            <rect x="1.5" y="1.5" width="8" height="8" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button
        className={`${base} hover:bg-red-500 hover:text-white`}
        aria-label="閉じる"
        title="閉じる"
        onClick={() => void win.close()}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true" stroke="currentColor">
          <path d="M1.5 1.5l8 8M9.5 1.5l-8 8" strokeWidth="1.1" />
        </svg>
      </button>
    </div>
  );
}
