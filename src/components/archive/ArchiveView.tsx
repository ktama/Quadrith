// アーカイブビュー(仕様書 §4.5)
// 完了タブ: 完了から archiveAfterHours 経過したタスク(完了日の新しい順)。
//           「復元」で進行中に戻し、元の座標でマトリクスへ再表示する。
// ごみ箱タブ: 論理削除済みタスク。復元 or 完全削除(30日で自動消去)。
// 検索・タグ絞り込みはヘッダーの共通フィルタが適用される。

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isArchived } from "../../lib/archive";
import { matchesFilters } from "../../lib/taskFilters";
import { readableTextColor } from "../../lib/tagColors";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTagStore } from "../../stores/tagStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import { STATUSES, type Task } from "../../types/models";

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("ja-JP") : "-";
}

function TaskRow({
  task,
  dateLabel,
  date,
  children,
}: {
  task: Task;
  dateLabel: string;
  date: string | null;
  children: ReactNode;
}) {
  const tags = useTagStore((s) => s.tags);
  const cardTags = tags.filter((t) => task.tagIds.includes(t.id));

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-slate-700 dark:text-slate-100 truncate">{task.title}</div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-slate-400">
            {dateLabel}: {fmt(date)}
          </span>
          {cardTags.map((t) => (
            <span
              key={t.id}
              className="text-[10px] px-1.5 rounded-full"
              style={{ background: t.color, color: readableTextColor(t.color) }}
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

export function ArchiveView() {
  const [tab, setTab] = useState<"done" | "trash">("done");

  const tasks = useTaskStore((s) => s.tasks);
  const trashed = useTaskStore((s) => s.trashed);
  const loadTrashed = useTaskStore((s) => s.loadTrashed);
  const setStatus = useTaskStore((s) => s.setStatus);
  const restoreFromTrash = useTaskStore((s) => s.restoreFromTrash);
  const purgeForever = useTaskStore((s) => s.purgeForever);
  const tagFilter = useUiStore((s) => s.tagFilter);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const now = useUiStore((s) => s.now);
  const archiveAfterHours = useSettingsStore((s) => s.settings.archiveAfterHours);

  // ごみ箱はストア常駐ではないため、ビュー表示時に取得する
  useEffect(() => {
    void loadTrashed();
  }, [loadTrashed]);

  const filters = { statuses: [...STATUSES], tagIds: tagFilter, query: searchQuery };

  const archivedTasks = useMemo(
    () =>
      tasks
        .filter((t) => isArchived(t, now, archiveAfterHours) && matchesFilters(t, filters))
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [tasks, now, archiveAfterHours, tagFilter, searchQuery], // filters はこの3値から派生
  );

  const trashedTasks = useMemo(
    () => trashed.filter((t) => matchesFilters(t, filters)),
    [trashed, tagFilter, searchQuery], // filters はこの2値から派生
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900">
      <div className="flex gap-1 px-4 pt-3 border-b border-slate-200 dark:border-slate-700">
        {(
          [
            ["done", `完了 (${archivedTasks.length})`],
            ["trash", `ごみ箱 (${trashedTasks.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`text-xs px-3 py-1.5 rounded-t-md border border-b-0 ${
              tab === key
                ? "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-100 -mb-px"
                : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "done" ? (
          archivedTasks.length === 0 ? (
            <p className="p-6 text-sm text-slate-400">アーカイブされたタスクはありません。</p>
          ) : (
            archivedTasks.map((t) => (
              <TaskRow key={t.id} task={t} dateLabel="完了" date={t.completedAt}>
                <button
                  className="text-xs px-3 py-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 shrink-0"
                  onClick={() => void setStatus(t.id, "doing")}
                >
                  復元
                </button>
              </TaskRow>
            ))
          )
        ) : trashedTasks.length === 0 ? (
          <p className="p-6 text-sm text-slate-400">
            ごみ箱は空です。削除から30日経過したタスクは自動的に完全削除されます。
          </p>
        ) : (
          trashedTasks.map((t) => (
            <TaskRow key={t.id} task={t} dateLabel="削除" date={t.deletedAt}>
              <button
                className="text-xs px-3 py-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 shrink-0"
                onClick={() => void restoreFromTrash(t.id)}
              >
                復元
              </button>
              <button
                className="text-xs px-3 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 shrink-0"
                onClick={() => {
                  if (window.confirm(`「${t.title}」を完全に削除しますか?この操作は取り消せません。`)) {
                    void purgeForever(t.id);
                  }
                }}
              >
                完全削除
              </button>
            </TaskRow>
          ))
        )}
      </div>
    </div>
  );
}
