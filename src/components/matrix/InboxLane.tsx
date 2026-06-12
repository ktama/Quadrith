// インボックスレーン(仕様書 §4.1)
// 未仕分けタスク(座標 NULL)の受け皿。マトリクスへのドラッグで仕分け、
// 逆方向のドラッグで差し戻し。クイック追加(アプリ内版)の入力欄もここに置く。

import { useEffect, useMemo, useRef, useState } from "react";
import { isArchived } from "../../lib/archive";
import { dragTargets } from "../../lib/dragTargets";
import { matchesFilters } from "../../lib/taskFilters";
import { useDragCard } from "../../hooks/useDragCard";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { Task } from "../../types/models";
import { TaskCardBody } from "./TaskCard";

function InboxCard({ task }: { task: Task }) {
  const { onPointerDown } = useDragCard(task.id);
  const selected = useUiStore((s) => s.selectedTaskId === task.id);
  const beingDragged = useUiStore((s) => s.dragging?.id === task.id);

  return (
    <div
      className={`shrink-0 ${beingDragged ? "opacity-30" : ""}`}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
    >
      <TaskCardBody task={task} selected={selected} />
    </div>
  );
}

export function InboxLane() {
  const laneRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("");

  const tasks = useTaskStore((s) => s.tasks);
  const add = useTaskStore((s) => s.add);
  const statusFilter = useUiStore((s) => s.statusFilter);
  const tagFilter = useUiStore((s) => s.tagFilter);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const now = useUiStore((s) => s.now);
  const dragging = useUiStore((s) => s.dragging);
  const archiveAfterHours = useSettingsStore((s) => s.settings.archiveAfterHours);

  useEffect(() => {
    dragTargets.inboxEl = laneRef.current;
    return () => {
      dragTargets.inboxEl = null;
    };
  }, []);

  const inboxTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.importance === null &&
          !isArchived(t, now, archiveAfterHours) &&
          matchesFilters(t, { statuses: statusFilter, tagIds: tagFilter, query: searchQuery }),
      ),
    [tasks, now, archiveAfterHours, statusFilter, tagFilter, searchQuery],
  );

  const submit = async () => {
    if (!title.trim()) return;
    await add(title);
    setTitle("");
  };

  return (
    <div
      ref={laneRef}
      className={`border-t border-slate-300 bg-slate-50 px-3 py-2 transition-colors ${
        dragging ? "bg-blue-50 outline-2 outline-dashed -outline-offset-2 outline-blue-300" : ""
      }`}
    >
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-xs font-bold text-slate-500">
          インボックス
          <span className="ml-1 font-normal">({inboxTasks.length})</span>
        </span>
        <input
          className="flex-1 max-w-xs text-xs border border-slate-300 rounded px-2 py-1 bg-white focus:outline-blue-400"
          placeholder="タスクを追加してEnter"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 min-h-[68px] items-start">
        {inboxTasks.length === 0 ? (
          <span className="text-xs text-slate-400 self-center">
            未仕分けのタスクはありません。カードをここへドラッグすると差し戻せます。
          </span>
        ) : (
          inboxTasks.map((t) => <InboxCard key={t.id} task={t} />)
        )}
      </div>
    </div>
  );
}
