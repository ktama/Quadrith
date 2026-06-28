// 定期タスク(繰り返しひな型)ビュー(仕様 §4.7)。
// ひな型の一覧・新規作成・編集・停止/再開・シリーズ削除を管理する。
// 発生日の実体生成は App 側の generateDue が起動時・日付変更時に行う。

import { useState } from "react";
import {
  defaultRule,
  describeRule,
  RecurrenceForm,
  type RecurrenceRule,
} from "./RecurrenceForm";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTagStore } from "../../stores/tagStore";
import { useTemplateStore, type TemplateInput } from "../../stores/templateStore";
import type { RecurringTemplate } from "../../types/models";
import { readableTextColor } from "../../lib/tagColors";

interface Draft {
  id: string | null; // null = 新規
  title: string;
  memo: string;
  importance: number | null;
  urgency: number | null;
  rule: RecurrenceRule;
  category: string | null;
  tagIds: string[];
}

function newDraft(): Draft {
  return {
    id: null,
    title: "",
    memo: "",
    importance: null,
    urgency: null,
    rule: defaultRule(),
    category: null,
    tagIds: [],
  };
}

function draftFrom(t: RecurringTemplate): Draft {
  return {
    id: t.id,
    title: t.title,
    memo: t.memo,
    importance: t.importance,
    urgency: t.urgency,
    rule: {
      freq: t.freq,
      interval: t.interval,
      byweekday: t.byweekday,
      bymonthday: t.bymonthday,
      anchorDate: t.anchorDate,
    },
    category: t.category,
    tagIds: t.tagIds,
  };
}

export function RecurringView() {
  const templates = useTemplateStore((s) => s.templates);
  const createTemplate = useTemplateStore((s) => s.create);
  const updateTemplate = useTemplateStore((s) => s.update);
  const setActive = useTemplateStore((s) => s.setActive);
  const removeTemplate = useTemplateStore((s) => s.remove);
  const tags = useTagStore((s) => s.tags);
  const categories = useSettingsStore((s) => s.settings.categories);

  const [draft, setDraft] = useState<Draft | null>(null);

  const save = () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return;
    const input: TemplateInput = {
      title,
      memo: draft.memo,
      importance: draft.importance,
      urgency: draft.urgency,
      freq: draft.rule.freq,
      interval: draft.rule.interval,
      byweekday: draft.rule.byweekday,
      bymonthday: draft.rule.bymonthday,
      anchorDate: draft.rule.anchorDate,
      category: draft.category,
      tagIds: draft.tagIds,
    };
    if (draft.id) void updateTemplate(draft.id, input);
    else void createTemplate(input);
    setDraft(null);
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col bg-white dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-100">
          繰り返しタスク ({templates.length})
        </span>
        <button
          className="text-xs px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-white"
          onClick={() => setDraft(newDraft())}
        >
          ＋ 新規作成
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {templates.length === 0 && !draft ? (
          <p className="p-6 text-sm text-slate-400">
            繰り返しタスクはまだありません。「新規作成」または、タスクの詳細パネルから登録できます。
          </p>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm truncate ${
                    t.active
                      ? "text-slate-700 dark:text-slate-100"
                      : "text-slate-400 line-through"
                  }`}
                >
                  {t.title}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {describeRule(t)} ・ 次回 {t.nextDue}
                  {!t.active && " ・ 停止中"}
                </div>
              </div>
              <button
                className="text-xs px-2.5 py-1.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 shrink-0"
                onClick={() => setActive(t.id, !t.active)}
              >
                {t.active ? "停止" : "再開"}
              </button>
              <button
                className="text-xs px-2.5 py-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 shrink-0"
                onClick={() => setDraft(draftFrom(t))}
              >
                編集
              </button>
              <button
                className="text-xs px-2.5 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 shrink-0"
                onClick={() => {
                  if (
                    window.confirm(
                      `繰り返し「${t.title}」を削除しますか?\n生成済みのタスクは残ります。`,
                    )
                  ) {
                    void removeTemplate(t.id);
                  }
                }}
              >
                削除
              </button>
            </div>
          ))
        )}
      </div>

      {/* 作成・編集フォーム(モーダル風) */}
      {draft && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => setDraft(null)}
        >
          <div
            className="w-96 max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm font-bold text-slate-700 dark:text-slate-100">
              {draft.id ? "繰り返しを編集" : "繰り返しを新規作成"}
            </span>

            <input
              className="w-full text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1.5 focus:outline-blue-400"
              placeholder="タイトル"
              value={draft.title}
              autoFocus
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />

            <RecurrenceForm
              value={draft.rule}
              onChange={(rule) => setDraft({ ...draft, rule })}
            />

            <textarea
              className="w-full text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1.5 focus:outline-blue-400 resize-none"
              rows={2}
              placeholder="メモ(任意)"
              value={draft.memo}
              onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
            />

            {(categories.length > 0 || draft.category) && (
              <select
                className="w-full text-xs border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1.5 focus:outline-blue-400"
                value={draft.category ?? ""}
                onChange={(e) => setDraft({ ...draft, category: e.target.value || null })}
              >
                <option value="">カテゴリ: (なし)</option>
                {draft.category && !categories.includes(draft.category) && (
                  <option value={draft.category}>{draft.category}</option>
                )}
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const active = draft.tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        active
                          ? "border-transparent"
                          : "text-slate-600 dark:text-slate-200 border-slate-300 dark:border-slate-600"
                      }`}
                      style={active ? { background: tag.color, color: readableTextColor(tag.color) } : {}}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          tagIds: active
                            ? draft.tagIds.filter((id) => id !== tag.id)
                            : [...draft.tagIds, tag.id],
                        })
                      }
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 text-sm py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-white disabled:opacity-50"
                disabled={!draft.title.trim()}
                onClick={save}
              >
                保存
              </button>
              <button
                className="text-sm px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200"
                onClick={() => setDraft(null)}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
