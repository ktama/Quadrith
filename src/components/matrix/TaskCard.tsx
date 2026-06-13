import type { CSSProperties } from "react";
import { CARD_W } from "../../lib/coords";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTagStore } from "../../stores/tagStore";
import type { Task } from "../../types/models";

// 期限バッジ: 期限切れ=赤 / 2日以内=橙 / それ以外=グレー(仕様書 §4.1)
function dueBadge(dueDate: string): { label: string; className: string } {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const label = `${due.getMonth() + 1}/${due.getDate()}`;
  if (diffDays < 0)
    return {
      label: `${label} 期限切れ`,
      className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    };
  if (diffDays <= 2)
    return { label, className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
  return { label, className: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300" };
}

// カード本体(マトリクス・インボックス・カンバン・ドラッグオーバーレイで共用)
// fluid: 親要素の幅いっぱいに広げる(カンバン用)
export function TaskCardBody({
  task,
  selected,
  fluid = false,
}: {
  task: Task;
  selected: boolean;
  fluid?: boolean;
}) {
  const statusColors = useSettingsStore((s) => s.settings.statusColors);
  const tags = useTagStore((s) => s.tags);
  const color = statusColors[task.status];
  const translucent = task.status === "pending" || task.status === "waiting";
  const badge = task.dueDate ? dueBadge(task.dueDate) : null;
  const cardTags = tags.filter((t) => task.tagIds.includes(t.id));

  return (
    <div
      className={`rounded-md bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 px-2 py-1.5 select-none cursor-grab
        ${translucent ? "opacity-70" : ""}
        ${task.status === "doing" ? "ring-2" : ""}
        ${selected ? "outline outline-2 outline-blue-500" : ""}`}
      style={{
        width: fluid ? "100%" : CARD_W,
        borderLeft: `4px solid ${color}`,
        ...(task.status === "doing" ? ({ "--tw-ring-color": color } as CSSProperties) : {}),
      }}
    >
      <div
        className={`text-xs font-medium leading-tight line-clamp-2 ${
          task.status === "done" ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-100"
        }`}
      >
        {task.title}
      </div>
      <div className="mt-1 flex items-center gap-1 min-h-[14px]">
        {cardTags.slice(0, 4).map((t) => (
          <span
            key={t.id}
            title={t.name}
            className="inline-block w-2 h-2 rounded-full shrink-0"
            style={{ background: t.color }}
          />
        ))}
        {badge && (
          <span className={`ml-auto text-[10px] px-1 rounded ${badge.className}`}>
            {badge.label}
          </span>
        )}
      </div>
    </div>
  );
}
