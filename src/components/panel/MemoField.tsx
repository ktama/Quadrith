// メモ欄(仕様書 §4.3「メモ(Markdown可だとなお良い)」)
// 編集(textarea)とプレビュー(Markdown描画)をトグルで切り替える。
// 内容があるときはプレビューで開き、クリックで編集に入る。
// react-markdown は dangerouslySetInnerHTML を使わないため XSS 安全。

import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";

// Markdown 内のリンクは WebView を遷移させず外部ブラウザで開く(SPA が消えるのを防ぐ)
function ExternalLink({ href, children }: { href?: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) void openUrl(href);
      }}
    >
      {children}
    </a>
  );
}

export function MemoField({
  value,
  onChange,
  onCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  const [mode, setMode] = useState<"edit" | "preview">(value.trim() ? "preview" : "edit");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode === "edit") textareaRef.current?.focus();
  }, [mode]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs text-slate-500 dark:text-slate-400">メモ</label>
        <button
          type="button"
          className="text-[11px] px-1.5 py-0.5 rounded text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          onClick={() => {
            if (mode === "edit") onCommit();
            setMode((m) => (m === "edit" ? "preview" : "edit"));
          }}
        >
          {mode === "edit" ? "プレビュー" : "編集"}
        </button>
      </div>

      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          className="w-full h-28 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1.5 resize-y focus:outline-blue-400"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onCommit}
          placeholder="補足を入力...(Markdown 対応)"
        />
      ) : (
        <div
          className="markdown-body min-h-[2rem] border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 cursor-text"
          onClick={() => setMode("edit")}
          title="クリックで編集"
        >
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
              {value}
            </ReactMarkdown>
          ) : (
            <span className="text-xs text-slate-400">メモはありません(クリックで追加)</span>
          )}
        </div>
      )}
    </div>
  );
}
