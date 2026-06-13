// リマインドのアプリ内表示(仕様書 フェーズ3)
// ヘッダーのベルに件数を出し、クリックで一覧をドロップダウン表示する。
// 期限 / 再確認日 / 第2領域の放置 を1つのリストに統合(notifications.ts と同じ computeReminders)。
// 行クリックでそのタスクの詳細パネルを開く。

import { useEffect, useMemo, useRef, useState } from "react";
import { computeReminders, type ReminderKind } from "../../lib/reminders";
import { todayLocal } from "../../lib/notifications";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";

const KIND_BADGE: Record<ReminderKind, { label: string; className: string }> = {
  due: { label: "期限", className: "bg-red-100 text-red-700" },
  review: { label: "再確認", className: "bg-purple-100 text-purple-700" },
  stale: { label: "放置", className: "bg-amber-100 text-amber-700" },
};

export function Reminders() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const tasks = useTaskStore((s) => s.tasks);
  const now = useUiStore((s) => s.now); // 1分ごとに更新 → 自動で再評価
  const select = useUiStore((s) => s.select);

  const items = useMemo(
    () => computeReminders(tasks, todayLocal(), now),
    [tasks, now],
  );

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const count = items.length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        className="relative w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300"
        title="リマインド"
        aria-label={count > 0 ? `リマインド ${count}件` : "リマインド"}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-base" aria-hidden="true">
          🔔
        </span>
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-300">
            リマインド({count})
          </div>
          <div className="max-h-80 overflow-y-auto">
            {count === 0 ? (
              <p className="px-3 py-6 text-xs text-slate-400 text-center">
                対応が必要なタスクはありません。
              </p>
            ) : (
              items.map((item, i) => {
                const badge = KIND_BADGE[item.kind];
                return (
                  <button
                    key={`${item.task.id}-${item.kind}-${i}`}
                    className="w-full flex items-start gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-left border-b border-slate-50 dark:border-slate-700/50 last:border-0"
                    onClick={() => {
                      select(item.task.id);
                      setOpen(false);
                    }}
                  >
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 mt-0.5 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs text-slate-700 dark:text-slate-100 truncate">
                        {item.task.title}
                      </span>
                      <span className="block text-[11px] text-slate-400">{item.detail}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
