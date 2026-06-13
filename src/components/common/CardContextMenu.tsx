// カード右クリックメニュー(仕様書 §4.2「カード上の右クリックメニュー...から状態変更」)
// 状態の変更とインボックスへの差し戻し・削除を提供する。
// 画面端でははみ出さないよう左/上方向へ寄せる。

import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import { STATUSES, STATUS_LABELS } from "../../types/models";

const MENU_W = 168;

export function CardContextMenu() {
  const menu = useUiStore((s) => s.contextMenu);
  const close = useUiStore((s) => s.closeContextMenu);
  const task = useTaskStore((s) => (menu ? s.tasks.find((t) => t.id === menu.taskId) : undefined));
  const setStatus = useTaskStore((s) => s.setStatus);
  const moveTo = useTaskStore((s) => s.moveTo);
  const remove = useTaskStore((s) => s.remove);
  const statusColors = useSettingsStore((s) => s.settings.statusColors);

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // メニューサイズ確定後に画面内へ収める
  useEffect(() => {
    if (!menu) return;
    const el = ref.current;
    const h = el?.offsetHeight ?? 260;
    setPos({
      x: Math.min(menu.x, window.innerWidth - MENU_W - 8),
      y: Math.min(menu.y, window.innerHeight - h - 8),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, close]);

  if (!menu || !task) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl py-1"
      style={{ left: pos.x, top: pos.y, width: MENU_W }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 py-1 text-[11px] font-bold text-slate-400">状態を変更</div>
      {STATUSES.map((s) => (
        <button
          key={s}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          onClick={() => {
            void setStatus(task.id, s);
            close();
          }}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColors[s] }} />
          {STATUS_LABELS[s]}
          {task.status === s && <span className="ml-auto text-blue-500">✓</span>}
        </button>
      ))}

      <div className="my-1 border-t border-slate-100 dark:border-slate-700" />

      {task.importance !== null && (
        <button
          className="w-full px-3 py-1.5 text-left text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          onClick={() => {
            void moveTo(task.id, null, null);
            close();
          }}
        >
          インボックスへ戻す
        </button>
      )}
      <button
        className="w-full px-3 py-1.5 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
        onClick={() => {
          void remove(task.id);
          close();
        }}
      >
        削除
      </button>
    </div>
  );
}
