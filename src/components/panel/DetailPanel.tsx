// 詳細パネル(仕様書 §4.3)
// タイトル・メモ・期限日・タグ・状態の編集。保留/待ちでは再確認日の設定を促す。

import { useState } from "react";
import { useTagStore } from "../../stores/tagStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import {
  STATUSES,
  STATUS_LABELS,
  type Status,
  type Task,
} from "../../types/models";
import { useSettingsStore } from "../../stores/settingsStore";

export function DetailPanel() {
  const selectedId = useUiStore((s) => s.selectedTaskId);
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === selectedId));
  if (!task) return null;
  // key でタスク切替時にローカル編集状態をリセット
  return <PanelInner key={task.id} task={task} />;
}

function PanelInner({ task }: { task: Task }) {
  const patch = useTaskStore((s) => s.patch);
  const setStatus = useTaskStore((s) => s.setStatus);
  const setTags = useTaskStore((s) => s.setTags);
  const remove = useTaskStore((s) => s.remove);
  const select = useUiStore((s) => s.select);
  const statusColors = useSettingsStore((s) => s.settings.statusColors);
  const tags = useTagStore((s) => s.tags);
  const createTag = useTagStore((s) => s.create);

  const [title, setTitle] = useState(task.title);
  const [memo, setMemo] = useState(task.memo);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== task.title) void patch(task.id, { title: t });
    else setTitle(task.title);
  };
  const commitMemo = () => {
    if (memo !== task.memo) void patch(task.id, { memo });
  };

  const toggleTag = (tagId: string) => {
    const next = task.tagIds.includes(tagId)
      ? task.tagIds.filter((id) => id !== tagId)
      : [...task.tagIds, tagId];
    void setTags(task.id, next);
  };

  const addTag = async () => {
    const tag = await createTag(newTagName, newTagColor);
    if (tag) {
      setNewTagName("");
      void setTags(task.id, [...task.tagIds, tag.id]);
    }
  };

  const needsReview = task.status === "pending" || task.status === "waiting";
  const fmt = (iso: string) => new Date(iso).toLocaleString("ja-JP");

  return (
    <aside className="w-80 shrink-0 border-l border-slate-300 bg-white flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
        <span className="text-xs font-bold text-slate-500">タスクの詳細</span>
        <button
          className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1"
          onClick={() => select(null)}
          title="閉じる"
        >
          ×
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4 text-sm">
        {/* タイトル */}
        <input
          className="w-full border border-slate-300 rounded px-2 py-1.5 font-medium focus:outline-blue-400"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />

        {/* 状態 */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">状態</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s: Status) => (
              <button
                key={s}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  task.status === s
                    ? "text-white border-transparent"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
                style={task.status === s ? { background: statusColors[s] } : {}}
                onClick={() => void setStatus(task.id, s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* 期限日 */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">期限日</label>
          <input
            type="date"
            className="border border-slate-300 rounded px-2 py-1 focus:outline-blue-400"
            value={task.dueDate ?? ""}
            onChange={(e) => void patch(task.id, { dueDate: e.target.value || null })}
          />
        </div>

        {/* 再確認日(保留・待ちの死蔵防止) */}
        {needsReview && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2">
            <label className="block text-xs text-amber-700 mb-1">
              再確認日(設定すると放置を防げます)
            </label>
            <input
              type="date"
              className="border border-slate-300 rounded px-2 py-1 bg-white focus:outline-blue-400"
              value={task.reviewAt ?? ""}
              onChange={(e) => void patch(task.id, { reviewAt: e.target.value || null })}
            />
          </div>
        )}

        {/* メモ */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">メモ</label>
          <textarea
            className="w-full h-28 border border-slate-300 rounded px-2 py-1.5 resize-y focus:outline-blue-400"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            onBlur={commitMemo}
            placeholder="補足を入力..."
          />
        </div>

        {/* タグ */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">タグ</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.length === 0 && (
              <span className="text-xs text-slate-400">タグはまだありません</span>
            )}
            {tags.map((t) => {
              const active = task.tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    active ? "text-white border-transparent" : "text-slate-600 border-slate-300"
                  }`}
                  style={active ? { background: t.color } : {}}
                  onClick={() => toggleTag(t.id)}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5 items-center">
            <input
              className="flex-1 min-w-0 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-blue-400"
              placeholder="新しいタグ"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addTag();
              }}
            />
            <input
              type="color"
              className="w-7 h-7 p-0 border border-slate-300 rounded cursor-pointer"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
            />
            <button
              className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
              onClick={() => void addTag()}
            >
              追加
            </button>
          </div>
        </div>

        {/* メタ情報 */}
        <div className="text-xs text-slate-400 space-y-0.5">
          <div>作成: {fmt(task.createdAt)}</div>
          <div>更新: {fmt(task.updatedAt)}</div>
          {task.completedAt && <div>完了: {fmt(task.completedAt)}</div>}
        </div>

        {/* アクション */}
        <div className="flex gap-2 pt-2 border-t border-slate-200">
          {task.status !== "done" ? (
            <button
              className="flex-1 text-sm py-1.5 rounded bg-green-500 hover:bg-green-600 text-white"
              onClick={() => void setStatus(task.id, "done")}
            >
              完了にする
            </button>
          ) : (
            <button
              className="flex-1 text-sm py-1.5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700"
              onClick={() => void setStatus(task.id, "doing")}
            >
              再開する
            </button>
          )}
          <button
            className="text-sm px-3 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200"
            onClick={() => void remove(task.id)}
          >
            削除
          </button>
        </div>
      </div>
    </aside>
  );
}
