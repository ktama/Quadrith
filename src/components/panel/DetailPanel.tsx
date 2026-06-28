// 詳細パネル(仕様書 §4.3)
// タイトル・メモ・期限日・タグ・状態の編集。保留/待ちでは再確認日の設定を促す。

import { useState } from "react";
import { MemoField } from "./MemoField";
import {
  defaultRule,
  describeRule,
  RecurrenceForm,
  type RecurrenceRule,
} from "../recurring/RecurrenceForm";
import { useTagStore } from "../../stores/tagStore";
import { useTaskStore } from "../../stores/taskStore";
import { useTemplateStore } from "../../stores/templateStore";
import { useUiStore } from "../../stores/uiStore";
import {
  STATUSES,
  STATUS_LABELS,
  type Status,
  type Task,
} from "../../types/models";
import { useSettingsStore } from "../../stores/settingsStore";
import { ColorPicker } from "../common/ColorPicker";
import { DEFAULT_TAG_COLOR, readableTextColor } from "../../lib/tagColors";

export function DetailPanel() {
  // 1件選択時のみ詳細を表示(0件 or 2件以上は App 側で一括バー等に振り分け)
  const selectedId = useUiStore((s) => (s.selectedIds.length === 1 ? s.selectedIds[0] : null));
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
  const categories = useSettingsStore((s) => s.settings.categories);
  const tags = useTagStore((s) => s.tags);
  const createTag = useTagStore((s) => s.create);
  const createTemplate = useTemplateStore((s) => s.create);

  const [title, setTitle] = useState(task.title);
  const [memo, setMemo] = useState(task.memo);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(DEFAULT_TAG_COLOR);
  const [recurRule, setRecurRule] = useState<RecurrenceRule | null>(null);

  const registerRecurrence = () => {
    if (!recurRule) return;
    void createTemplate({
      title: task.title,
      memo: task.memo,
      importance: task.importance,
      urgency: task.urgency,
      freq: recurRule.freq,
      interval: recurRule.interval,
      byweekday: recurRule.byweekday,
      bymonthday: recurRule.bymonthday,
      anchorDate: recurRule.anchorDate,
      category: task.category,
      tagIds: task.tagIds,
      // この詳細パネルのタスク自身が anchor 当日ぶんを担うため、次回以降から生成する
      skipAnchorOccurrence: true,
    });
    setRecurRule(null);
  };

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
    <aside className="w-80 shrink-0 border-l border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-300">タスクの詳細</span>
        <div className="flex items-center gap-1">
          <button
            className="text-slate-400 hover:text-indigo-500 text-base leading-none px-1"
            onClick={() => setRecurRule(defaultRule())}
            title="繰り返しに登録"
            aria-label="繰り返しに登録"
          >
            🔁
          </button>
          <button
            className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1"
            onClick={() => select(null)}
            title="閉じる"
            aria-label="詳細パネルを閉じる"
          >
            ×
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4 text-sm">
        {/* タイトル */}
        <input
          className="w-full bg-transparent border border-transparent rounded-md px-2 py-1.5 text-base font-semibold text-slate-800 dark:text-slate-100
            hover:bg-slate-50 dark:hover:bg-slate-700/50
            focus:bg-white dark:focus:bg-slate-700 focus:border-slate-300 dark:focus:border-slate-600 focus:outline-none transition-colors"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />

        {/* 状態 */}
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">状態</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s: Status) => (
              <button
                key={s}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  task.status === s
                    ? "text-white border-transparent"
                    : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
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
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">期限日</label>
          <input
            type="date"
            className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-blue-400"
            value={task.dueDate ?? ""}
            onChange={(e) => void patch(task.id, { dueDate: e.target.value || null })}
          />
        </div>

        {/* カテゴリ(Redmine エクスポート用, §4.8) */}
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">カテゴリ</label>
          <select
            className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-blue-400"
            value={task.category ?? ""}
            onChange={(e) => void patch(task.id, { category: e.target.value || null })}
          >
            <option value="">(なし)</option>
            {/* 候補から外れた既存の値も選択肢に残す */}
            {task.category && !categories.includes(task.category) && (
              <option value={task.category}>{task.category}</option>
            )}
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* 再確認日(保留・待ちの死蔵防止) */}
        {needsReview && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded p-2">
            <label className="block text-xs text-amber-700 dark:text-amber-300 mb-1">
              再確認日(設定すると放置を防げます)
            </label>
            <input
              type="date"
              className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 bg-white focus:outline-blue-400"
              value={task.reviewAt ?? ""}
              onChange={(e) => void patch(task.id, { reviewAt: e.target.value || null })}
            />
          </div>
        )}

        {/* メモ(Markdown 対応) */}
        <MemoField value={memo} onChange={setMemo} onCommit={commitMemo} />

        {/* タグ */}
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">タグ</label>
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
                    active
                      ? "border-transparent"
                      : "text-slate-600 dark:text-slate-200 border-slate-300 dark:border-slate-600"
                  }`}
                  style={
                    active
                      ? { background: t.color, color: readableTextColor(t.color) }
                      : {}
                  }
                  onClick={() => toggleTag(t.id)}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5 items-center">
              <input
                className="flex-1 min-w-0 text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-blue-400"
                placeholder="新しいタグ"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addTag();
                }}
              />
              <button
                className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 shrink-0"
                onClick={() => void addTag()}
              >
                追加
              </button>
            </div>
            <ColorPicker value={newTagColor} onChange={setNewTagColor} />
          </div>
        </div>

        {/* メタ情報 */}
        <div className="text-xs text-slate-400 space-y-0.5">
          <div>作成: {fmt(task.createdAt)}</div>
          <div>更新: {fmt(task.updatedAt)}</div>
          {task.completedAt && <div>完了: {fmt(task.completedAt)}</div>}
        </div>

        {/* アクション */}
        <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          {task.status !== "done" ? (
            <button
              className="flex-1 text-sm py-1.5 rounded bg-green-500 hover:bg-green-600 text-white"
              onClick={() => void setStatus(task.id, "done")}
            >
              完了にする
            </button>
          ) : (
            <button
              className="flex-1 text-sm py-1.5 rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-100"
              onClick={() => void setStatus(task.id, "doing")}
            >
              再開する
            </button>
          )}
          <button
            className="text-sm px-3 py-1.5 rounded bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-800"
            onClick={() => void remove(task.id)}
          >
            削除
          </button>
        </div>
      </div>

      {/* 繰り返し設定モーダル(パネル内に展開せず中央オーバーレイで表示) */}
      {recurRule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setRecurRule(null)}
        >
          <div
            className="w-96 max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-bold text-slate-700 dark:text-slate-100">
              「{task.title}」を繰り返しに登録
            </span>
            <RecurrenceForm value={recurRule} onChange={setRecurRule} />
            <p className="text-[11px] text-slate-400">
              このタスクの内容・配置・タグを引き継いだ繰り返し({describeRule(recurRule)})を作成します。
              この詳細のタスク自身が当日分を担うため、生成は次回以降から始まります。
            </p>
            <div className="flex gap-2">
              <button
                className="flex-1 text-sm py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-white"
                onClick={registerRecurrence}
              >
                登録
              </button>
              <button
                className="text-sm px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200"
                onClick={() => setRecurRule(null)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
