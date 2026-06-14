// メイン画面のマトリクスビュー(仕様書 §4.1)
// 縦軸: 重要度(上が高)/ 横軸: 緊急度(右が高)。
// 衝突回避レイアウト + クラスタ集約は useMemo で計算し、
// 依存はタスク座標リストとコンテナサイズのみ。

import { useEffect, useMemo, useRef, useState } from "react";
import { isArchived } from "../../lib/archive";
import { dragTargets } from "../../lib/dragTargets";
import { computeMatrixLayout } from "../../lib/layout";
import { matchesFilters } from "../../lib/taskFilters";
import { useDragCard } from "../../hooks/useDragCard";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { Task } from "../../types/models";
import { ClusterBadge } from "./ClusterBadge";
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
  const openContextMenu = useUiStore((s) => s.openContextMenu);

  return (
    <div
      className={`absolute transition-opacity hover:z-30 ${beingDragged ? "opacity-30" : ""}`}
      style={{ left: x, top: y, zIndex: selected ? 20 : 10, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(task.id, e.clientX, e.clientY);
      }}
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
  const tagFilter = useUiStore((s) => s.tagFilter);
  const searchQuery = useUiStore((s) => s.searchQuery);
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

  // 表示対象: 座標あり・未アーカイブ・フィルタ(状態/タグ/検索)に合致
  const visible = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.importance !== null &&
          t.urgency !== null &&
          !isArchived(t, now, archiveAfterHours) &&
          matchesFilters(t, { statuses: statusFilter, tagIds: tagFilter, query: searchQuery }),
      ),
    [tasks, now, archiveAfterHours, statusFilter, tagFilter, searchQuery],
  );

  const layout = useMemo(
    () =>
      computeMatrixLayout(
        visible.map((t) => ({ id: t.id, importance: t.importance!, urgency: t.urgency! })),
        size.w,
        size.h,
      ),
    [visible, size],
  );

  const taskById = useMemo(() => new Map(visible.map((t) => [t.id, t])), [visible]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 overflow-hidden bg-white dark:bg-slate-800"
    >
      {/* ドットグリッド(奥行きの演出) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(var(--dot) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* 象限の背景(右上 = 重要かつ緊急 を薄く強調) */}
      <div className="absolute right-0 top-0 w-1/2 h-1/2 bg-red-50/50 dark:bg-red-500/[0.07] pointer-events-none" />
      <div className="absolute left-0 top-0 w-1/2 h-1/2 bg-blue-50/40 dark:bg-blue-500/[0.07] pointer-events-none" />

      {/* 中央の十字境界線 */}
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700 pointer-events-none" />
      <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-200 dark:bg-slate-700 pointer-events-none" />

      {/* 象限ラベル */}
      {QUADRANT_LABELS.map((q) => (
        <span
          key={q.label}
          className={`absolute ${q.className} text-[11px] font-semibold uppercase tracking-wider text-slate-400/70 dark:text-slate-500 pointer-events-none select-none`}
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

      {/* タスクカード(クラスタ化されなかったもの) */}
      {layout.cards.map((pos) => {
        const task = taskById.get(pos.id);
        if (!task) return null;
        return <MatrixCard key={task.id} task={task} x={pos.x} y={pos.y} />;
      })}

      {/* クラスタバッジ(+N) */}
      {layout.clusters.map((c) => (
        <ClusterBadge key={c.id} cluster={c} containerW={size.w} />
      ))}
    </div>
  );
}
