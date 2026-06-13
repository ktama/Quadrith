// 状態別カンバンビュー(仕様書 §4.2)
// 同じデータの別表示。列間の HTML5 ドラッグ&ドロップで状態を変更できる。

import { useMemo, useState } from "react";
import { isArchived } from "../../lib/archive";
import { matchesFilters } from "../../lib/taskFilters";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import { STATUSES, STATUS_LABELS, type Status, type Task } from "../../types/models";
import { TaskCardBody } from "../matrix/TaskCard";

function KanbanColumn({
  status,
  tasks,
  onDropTask,
}: {
  status: Status;
  tasks: Task[];
  onDropTask: (taskId: string, status: Status) => void;
}) {
  const statusColors = useSettingsStore((s) => s.settings.statusColors);
  const select = useUiStore((s) => s.select);
  const selectedId = useUiStore((s) => s.selectedTaskId);
  const openContextMenu = useUiStore((s) => s.openContextMenu);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`flex-1 min-w-44 flex flex-col rounded-lg border bg-slate-50 dark:bg-slate-800 transition-colors ${
        dragOver
          ? "border-blue-400 bg-blue-50 dark:bg-blue-900/30"
          : "border-slate-200 dark:border-slate-700"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) onDropTask(id, status);
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: statusColors[status] }} />
        <span className="text-xs font-bold text-slate-600 dark:text-slate-200">
          {STATUS_LABELS[status]}
        </span>
        <span className="text-xs text-slate-400 ml-auto">{tasks.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {tasks.map((t) => (
          <div
            key={t.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
            onClick={() => select(t.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              openContextMenu(t.id, e.clientX, e.clientY);
            }}
          >
            <TaskCardBody task={t} selected={selectedId === t.id} fluid />
          </div>
        ))}
      </div>
    </div>
  );
}

export function KanbanView() {
  const tasks = useTaskStore((s) => s.tasks);
  const setStatus = useTaskStore((s) => s.setStatus);
  const statusFilter = useUiStore((s) => s.statusFilter);
  const tagFilter = useUiStore((s) => s.tagFilter);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const now = useUiStore((s) => s.now);
  const archiveAfterHours = useSettingsStore((s) => s.settings.archiveAfterHours);

  const byStatus = useMemo(() => {
    const map = new Map<Status, Task[]>(STATUSES.map((s) => [s, []]));
    for (const t of tasks) {
      if (isArchived(t, now, archiveAfterHours)) continue;
      // 状態は列で表現するため、絞り込みはタグ・検索のみ適用
      if (!matchesFilters(t, { statuses: [...STATUSES], tagIds: tagFilter, query: searchQuery })) {
        continue;
      }
      map.get(t.status)!.push(t);
    }
    return map;
  }, [tasks, now, archiveAfterHours, tagFilter, searchQuery]);

  const columns = STATUSES.filter((s) => statusFilter.includes(s));

  return (
    <div className="flex-1 min-h-0 flex gap-3 p-3 overflow-x-auto bg-white dark:bg-slate-900">
      {columns.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          tasks={byStatus.get(status)!}
          onDropTask={(id, st) => void setStatus(id, st)}
        />
      ))}
      {columns.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
          状態フィルタですべて非表示になっています
        </div>
      )}
    </div>
  );
}
