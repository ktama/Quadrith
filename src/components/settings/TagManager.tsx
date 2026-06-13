// タグ管理(改善 #7): リネーム・色変更・削除。設定画面の1セクション。

import { useState } from "react";
import { useTagStore } from "../../stores/tagStore";

export function TagManager() {
  const tags = useTagStore((s) => s.tags);
  const rename = useTagStore((s) => s.rename);
  const recolor = useTagStore((s) => s.recolor);
  const remove = useTagStore((s) => s.remove);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commit = (id: string) => {
    void rename(id, draft);
    setEditing(null);
  };

  if (tags.length === 0) {
    return <p className="text-xs text-slate-400">タグはまだありません。タスクの詳細から追加できます。</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {tags.map((t) => (
        <div key={t.id} className="flex items-center gap-2">
          <input
            type="color"
            aria-label={`${t.name} の色`}
            className="w-6 h-6 p-0 border border-slate-300 dark:border-slate-600 rounded cursor-pointer shrink-0"
            value={t.color}
            onChange={(e) => void recolor(t.id, e.target.value)}
          />
          {editing === t.id ? (
            <input
              autoFocus
              aria-label="タグ名"
              className="flex-1 min-w-0 text-sm border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(t.id);
                if (e.key === "Escape") setEditing(null);
              }}
            />
          ) : (
            <button
              className="flex-1 min-w-0 text-left text-sm text-slate-700 dark:text-slate-200 truncate hover:underline"
              title="クリックでリネーム"
              onClick={() => {
                setEditing(t.id);
                setDraft(t.name);
              }}
            >
              {t.name}
            </button>
          )}
          <button
            aria-label={`タグ「${t.name}」を削除`}
            className="text-xs px-2 py-1 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 shrink-0"
            onClick={() => {
              if (window.confirm(`タグ「${t.name}」を削除しますか?全タスクから外れます。`)) {
                void remove(t.id);
              }
            }}
          >
            削除
          </button>
        </div>
      ))}
    </div>
  );
}
