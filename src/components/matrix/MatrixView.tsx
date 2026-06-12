// メイン画面のマトリクスビュー(仕様書 §4.1)
// 縦軸: 重要度(上が高)/ 横軸: 緊急度(右が高)。
// 衝突回避レイアウトは useMemo で計算し、依存はタスク座標リストとコンテナサイズのみ。

import { useEffect, useMemo, useRef, useState } from "react";
import { isArchived } from "../../lib/archive";
import { dragTargets } from "../../lib/dragTargets";
import { layoutCards } from "../../lib/layout";
import { useDragCard } from "../../hooks/useDragCard";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { Task } from "../../types/models";
import { TaskCardBody } from "./TaskCard";

const QUADRANT_LABELS = [
  { label: "計画する", className: "left-4 top-8" },
  { label: "今すぐやる", className: "right-4 top-8" },
  { label: "やめる候補", className: "left-4 bottom-8" },
  { label: "さばく・任せる", className: "right-4 bottom-8" },
];

function MatrixCard({ task, x, y }: { task: Task; x: number; y: number }) {
  const { onPointerDown } = useDragCard(task.id);
  const selected = useUiStore((s) => s.selectedTaskId === task.id);
  const beingDragged = useUiStore((s) => s.dragging?.id === task.id);

  return (
    <div
      className={`absolute transition-opacity hover:z-30 ${beingDragged ? "opacity-30" : ""}`}
      style={{ left: x, top: y, zIndex: selected ? 20 : 10, touchAction: "none" }}
      onPointerDown={onPointerDown}
    >
      <TaskCardBody task={task} selected={selected} />
    </div>
  );
}

export function MatrixView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const tasks = useTaskStore((s) => s.tasks);
  const statusFilter = useUiStore((s) => s.statusFilter);
  const now = useUiStore((s) => s.now);
  const archiveAfterHours = useSettingsStore((s) => s.settings.archiveAfterHours);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    dragTargets.matrixEl = el;
    const observer = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      dragTargets.matrixEl = null;
    };
  }, []);

  // 表示対象: 座標あり・未アーカイブ・状態フィルタに合致
  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.importance !== null &&
          t.urgency !== null &&
          !isArchived(t, now, archiveAfterHours) &&
          statusFilter.includes(t.status),
      ),
    [tasks, now, archiveAfterHours, statusFilter],
  );

  const positions = useMemo(() => {
    const placed = layoutCards(
      visible.map((t) => ({ id: t.id, importance: t.importance!, urgency: t.urgency! })),
      size.w,
      size.h,
    );
    return new Map(placed.map((p) => [p.id, p]));
  }, [visible, size]);

  return (
    <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden bg-white">
      {/* 象限の背景(右上 = 重要かつ緊急 を薄く強調) */}
      <div className="absolute right-0 top-0 w-1/2 h-1/2 bg-red-50/60 pointer-events-none" />
      <div className="absolute left-0 top-0 w-1/2 h-1/2 bg-blue-50/40 pointer-events-none" />

      {/* 中央の十字境界線 */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300 pointer-events-none" />
      <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-300 pointer-events-none" />

      {/* 象限ラベル */}
      {QUADRANT_LABELS.map((q) => (
        <span
          key={q.label}
          className={`absolute ${q.className} text-sm font-semibold text-slate-300 pointer-events-none select-none`}
        >
          {q.label}
        </span>
      ))}

      {/* 軸ラベル */}
      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 -rotate-90 origin-center text-[11px] text-slate-400 pointer-events-none select-none">
        重要度 →
      </span>
      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[11px] text-slate-400 pointer-events-none select-none">
        緊急度 →
      </span>

      {/* タスクカード */}
      {visible.map((t) => {
        const pos = positions.get(t.id);
        if (!pos) return null;
        return <MatrixCard key={t.id} task={t} x={pos.x} y={pos.y} />;
      })}
    </div>
  );
}
