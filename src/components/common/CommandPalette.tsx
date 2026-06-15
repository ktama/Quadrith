// コマンドパレット(改善: Ctrl+K)。ビュー移動・選択中タスクへの操作・
// タスク検索ジャンプ・新規作成をキーボードから実行する。
// 絞り込み/並べ替えは純粋関数 lib/commandPalette.ts に委譲。

import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "../../lib/commandPalette";
import { useTagStore } from "../../stores/tagStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore, type View } from "../../stores/uiStore";
import { STATUSES, STATUS_LABELS } from "../../types/models";

const VIEW_LABELS: { view: View; label: string; keywords: string }[] = [
  { view: "matrix", label: "マトリクス", keywords: "matrix" },
  { view: "kanban", label: "カンバン", keywords: "kanban" },
  { view: "recurring", label: "繰り返し", keywords: "recurring" },
  { view: "archive", label: "アーカイブ・ごみ箱", keywords: "archive trash" },
  { view: "stats", label: "統計", keywords: "stats" },
  { view: "settings", label: "設定", keywords: "settings" },
];

export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const setView = useUiStore((s) => s.setView);
  const select = useUiStore((s) => s.select);
  const selectedIds = useUiStore((s) => s.selectedIds);

  const tasks = useTaskStore((s) => s.tasks);
  const tags = useTagStore((s) => s.tags);
  const add = useTaskStore((s) => s.add);
  const setStatus = useTaskStore((s) => s.setStatus);
  const setTags = useTaskStore((s) => s.setTags);
  const moveTo = useTaskStore((s) => s.moveTo);
  const removeMany = useTaskStore((s) => s.removeMany);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  // 開いたら入力欄へフォーカス・状態リセット
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // モーダル表示直後に DOM が出来るのを待ってフォーカス
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // ① ビュー移動
    for (const v of VIEW_LABELS) {
      cmds.push({
        id: `view:${v.view}`,
        title: `${v.label}に移動`,
        hint: "ビュー",
        keywords: v.keywords,
        run: () => setView(v.view),
      });
    }

    // ② 選択中タスクへの操作(1件以上選択時のみ)
    if (selectedIds.length > 0) {
      const n = selectedIds.length;
      const selectedTasks = tasks.filter((t) => selectedIds.includes(t.id));
      for (const st of STATUSES) {
        cmds.push({
          id: `status:${st}`,
          title: `選択中(${n})を「${STATUS_LABELS[st]}」にする`,
          hint: "状態",
          run: () => selectedTasks.forEach((t) => void setStatus(t.id, st)),
        });
      }
      for (const tag of tags) {
        cmds.push({
          id: `tag-add:${tag.id}`,
          title: `選択中(${n})にタグ「${tag.name}」を付ける`,
          hint: "タグ",
          run: () =>
            selectedTasks.forEach((t) => {
              if (!t.tagIds.includes(tag.id)) void setTags(t.id, [...t.tagIds, tag.id]);
            }),
        });
        cmds.push({
          id: `tag-del:${tag.id}`,
          title: `選択中(${n})からタグ「${tag.name}」を外す`,
          hint: "タグ",
          run: () =>
            selectedTasks.forEach((t) => {
              if (t.tagIds.includes(tag.id))
                void setTags(t.id, t.tagIds.filter((id) => id !== tag.id));
            }),
        });
      }
      cmds.push({
        id: "to-inbox",
        title: `選択中(${n})をインボックスへ戻す`,
        hint: "移動",
        run: () => selectedTasks.forEach((t) => void moveTo(t.id, null, null)),
      });
      cmds.push({
        id: "delete",
        title: `選択中(${n})を削除`,
        hint: "削除",
        run: () => void removeMany(selectedIds),
      });
    }

    // ③ タスク検索ジャンプ
    for (const t of tasks) {
      cmds.push({
        id: `jump:${t.id}`,
        title: t.title || "(無題)",
        hint: "ジャンプ",
        run: () => select(t.id),
      });
    }

    return cmds;
  }, [selectedIds, tasks, tags, setView, setStatus, setTags, moveTo, removeMany, select]);

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  // ④ 新規作成(入力テキストがあるときだけ末尾に追加。常に選べる)
  const trimmed = query.trim();
  const createCmd: Command | null = trimmed
    ? {
        id: "create",
        title: `「${trimmed}」をインボックスに追加`,
        hint: "新規",
        run: () => void add(trimmed),
      }
    : null;

  const items = createCmd ? [...filtered, createCmd] : filtered;

  // クエリ変更で先頭へ
  useEffect(() => setActive(0), [query]);

  // アクティブ項目をスクロール内に保つ
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [active]);

  if (!open) return null;

  const runAt = (idx: number) => {
    const item = items[idx];
    if (!item) return;
    item.run();
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] bg-black/30"
      onMouseDown={close}
    >
      <div
        className="w-[36rem] max-w-[90vw] max-h-[70vh] flex flex-col bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="px-4 py-3 text-sm bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none border-b border-slate-200 dark:border-slate-700"
          placeholder="コマンド・タスクを検索…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-4 py-3 text-xs text-slate-400">該当するコマンドがありません</div>
          )}
          {items.map((item, idx) => (
            <button
              key={item.id}
              data-idx={idx}
              className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm ${
                idx === active
                  ? "bg-blue-500 text-white"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              }`}
              onMouseMove={() => setActive(idx)}
              onClick={() => runAt(idx)}
            >
              <span className="flex-1 min-w-0 truncate">{item.title}</span>
              {item.hint && (
                <span
                  className={`text-[10px] shrink-0 ${
                    idx === active ? "text-blue-100" : "text-slate-400"
                  }`}
                >
                  {item.hint}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
