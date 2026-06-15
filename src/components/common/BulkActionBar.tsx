// 一括操作バー(改善: 複数選択)。2件以上選択時に詳細パネルの枠へ差し替えて表示。
// 既存の楽観更新 API をループ適用する(削除のみ 1 回の Undo でまとめて戻す removeMany)。

import { useMemo } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTagStore } from "../../stores/tagStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import { STATUSES, STATUS_LABELS, type Status } from "../../types/models";

export function BulkActionBar() {
  const selectedIds = useUiStore((s) => s.selectedIds);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const statusColors = useSettingsStore((s) => s.settings.statusColors);
  const tags = useTagStore((s) => s.tags);

  const tasks = useTaskStore((s) => s.tasks);
  const setStatus = useTaskStore((s) => s.setStatus);
  const setTags = useTaskStore((s) => s.setTags);
  const moveTo = useTaskStore((s) => s.moveTo);
  const removeMany = useTaskStore((s) => s.removeMany);

  const selected = useMemo(
    () => tasks.filter((t) => selectedIds.includes(t.id)),
    [tasks, selectedIds],
  );
  const n = selected.length;

  const applyStatus = (st: Status) => selected.forEach((t) => void setStatus(t.id, st));
  const addTag = (tagId: string) =>
    selected.forEach((t) => {
      if (!t.tagIds.includes(tagId)) void setTags(t.id, [...t.tagIds, tagId]);
    });
  const removeTag = (tagId: string) =>
    selected.forEach((t) => {
      if (t.tagIds.includes(tagId)) void setTags(t.id, t.tagIds.filter((id) => id !== tagId));
    });
  const toInbox = () => selected.forEach((t) => void moveTo(t.id, null, null));
  const removeAll = () => void removeMany(selectedIds);

  // 各タグが選択タスクのうち何件に付いているか(全件/一部/0件の表示用)
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of selected) for (const id of t.tagIds) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [selected]);

  return (
    <aside className="w-80 shrink-0 border-l border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-300">{n}件を選択中</span>
        <button
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          onClick={clearSelection}
        >
          選択解除
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {/* 状態変更 */}
        <div>
          <div className="text-[11px] font-bold text-slate-400 mb-1.5">状態を変更</div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((st) => (
              <button
                key={st}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => applyStatus(st)}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: statusColors[st] }} />
                {STATUS_LABELS[st]}
              </button>
            ))}
          </div>
        </div>

        {/* タグ */}
        {tags.length > 0 && (
          <div>
            <div className="text-[11px] font-bold text-slate-400 mb-1.5">タグ</div>
            <div className="flex flex-col gap-1">
              {tags.map((tag) => {
                const cnt = tagCounts.get(tag.id) ?? 0;
                const state = cnt === 0 ? "なし" : cnt === n ? "全件" : `${cnt}/${n}`;
                return (
                  <div key={tag.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tag.color }} />
                    <span className="flex-1 min-w-0 truncate text-xs text-slate-700 dark:text-slate-200">
                      {tag.name}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">{state}</span>
                    <button
                      className="text-[11px] px-1.5 py-0.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 shrink-0"
                      onClick={() => addTag(tag.id)}
                      aria-label={`タグ「${tag.name}」を全件に付ける`}
                    >
                      付ける
                    </button>
                    <button
                      className="text-[11px] px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
                      onClick={() => removeTag(tag.id)}
                      aria-label={`タグ「${tag.name}」を全件から外す`}
                    >
                      外す
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* その他 */}
        <div className="flex flex-col gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-700">
          <button
            className="text-sm py-1.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200"
            onClick={toInbox}
          >
            インボックスへ戻す
          </button>
          <button
            className="text-sm py-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            onClick={removeAll}
          >
            {n}件を削除
          </button>
        </div>
      </div>
    </aside>
  );
}
