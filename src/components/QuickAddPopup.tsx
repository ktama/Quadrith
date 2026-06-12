// クイック追加ポップアップ(仕様書 §4.4)
// グローバルホットキーで表示される専用の小ウィンドウ(label: "quickadd")。
// タイトルだけ入力して Enter → インボックス(座標NULL)に未着手で追加し、
// "quick-task-added" イベントでメインウィンドウへ再読込を依頼する。
// Esc または フォーカス喪失で非表示に戻る。

import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import * as taskRepo from "../repositories/taskRepo";

export function QuickAddPopup() {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    // 表示(=フォーカス取得)のたびに入力欄へフォーカス、喪失で隠す
    const unlistenPromise = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        inputRef.current?.focus();
      } else {
        setTitle("");
        setError(null);
        void win.hide();
      }
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const close = () => {
    setTitle("");
    setError(null);
    void getCurrentWindow().hide();
  };

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const res = await taskRepo.create({ title: trimmed });
    setSaving(false);
    if (res.ok) {
      await emit("quick-task-added");
      close();
    } else {
      setError(res.error.message);
    }
  };

  return (
    <div className="h-screen flex flex-col justify-center bg-slate-800 px-4 select-none">
      <div className="flex items-center gap-3">
        <span className="text-amber-400 text-lg shrink-0">⚡</span>
        <input
          ref={inputRef}
          autoFocus
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
      {error && <p className="text-xs text-red-400 mt-1 ml-8">{error}</p>}
    </div>
  );
}
