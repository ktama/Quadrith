// クイック追加ポップアップ(仕様書 §4.4)
// グローバルホットキーで表示される専用の小ウィンドウ(label: "quickadd")。
// タイトルだけ入力して Enter → "quick-add-submit" イベントで本体に追加を依頼する。
// このウィンドウは DB に触れない(本体と同一DBへ2本目の接続を張らないため)。
// Esc または フォーカス喪失で非表示に戻る。

import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function QuickAddPopup() {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    // 表示(=フォーカス取得)のたびに入力欄へフォーカス、喪失で隠す
    const unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        inputRef.current?.focus();
      } else {
        setTitle("");
        void win.hide();
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const close = () => {
    setTitle("");
    void getCurrentWindow().hide();
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await emit("quick-add-submit", trimmed);
    close();
  };

  return (
    <div className="h-screen flex flex-col justify-center bg-slate-800 px-4 select-none">
      <div className="flex items-center gap-3">
        <span className="text-amber-400 text-lg shrink-0" aria-hidden="true">
          ⚡
        </span>
        <input
          ref={inputRef}
          autoFocus
          aria-label="クイック追加のタスク名"
          className="flex-1 bg-transparent text-white text-sm placeholder-slate-400 outline-none"
          placeholder="タスクのタイトルを入力..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") close();
          }}
        />
        <span className="text-[10px] text-slate-500 shrink-0">
          Enter: インボックスへ追加 / Esc: 閉じる
        </span>
      </div>
    </div>
  );
}
