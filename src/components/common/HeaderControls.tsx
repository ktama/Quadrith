// ヘッダーの共通操作部品: ビュー切替タブ / タグ絞り込み / 検索ボックス

import { useTagStore } from "../../stores/tagStore";
import { useUiStore, type View } from "../../stores/uiStore";

const VIEWS: { key: View; label: string }[] = [
  { key: "matrix", label: "マトリクス" },
  { key: "kanban", label: "カンバン" },
  { key: "archive", label: "アーカイブ" },
  { key: "stats", label: "統計" },
];

export function ViewTabs() {
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          className={`text-xs font-medium px-2.5 py-1 rounded-md transition-all ${
            view === v.key
              ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white"
          }`}
          onClick={() => setView(v.key)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

export function TagFilterChips() {
  const tags = useTagStore((s) => s.tags);
  const tagFilter = useUiStore((s) => s.tagFilter);
  const toggle = useUiStore((s) => s.toggleTagFilter);

  if (tags.length === 0) return null;
  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      <span className="text-[11px] text-slate-400">タグ:</span>
      {tags.map((t) => {
        const active = tagFilter.includes(t.id);
        return (
          <button
            key={t.id}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              active
                ? "text-white border-transparent"
                : "bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border-slate-300 dark:border-slate-600"
            }`}
            style={active ? { background: t.color } : {}}
            onClick={() => toggle(t.id)}
          >
            {t.name}
          </button>
        );
      })}
    </div>
  );
}

export function SearchBox() {
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);

  return (
    <div className="relative">
      <input
        className="text-xs border border-slate-300 dark:border-slate-600 rounded-full pl-3 pr-7 py-1.5 w-48 bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-blue-400"
        placeholder="タイトル・メモを検索"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {searchQuery && (
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          onClick={() => setSearchQuery("")}
        >
          ×
        </button>
      )}
    </div>
  );
}
