// Today / フォーカスビュー(仕様 §4.9)
// 2グループ(自動 / 選択)+ 理由バッジ + 容量メーター。
// グループ分け・並び・容量集計は純粋関数 lib/today に委譲する。

import { useMemo } from "react";
import { capacitySummary, todayGroups, type TodayBadge, type TodayCard } from "../../lib/today";
import { taskQuadrant } from "../../lib/quadrant";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import { STATUS_LABELS, type Task } from "../../types/models";

function localToday(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

const BADGE_META: Record<TodayBadge, { label: string; className: string }> = {
  overdue: { label: "🔴 期限超過", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  "due-today": { label: "🟠 今日期限", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  doing: { label: "🔵 進行中", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  review: { label: "🟣 再確認", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  urgent: { label: "⚡ 今すぐ", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" },
  pick: { label: "★ 今日やる", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
};

function Badges({ badges }: { badges: TodayBadge[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span key={b} className={`text-[10px] leading-none px-1.5 py-0.5 rounded ${BADGE_META[b].className}`}>
          {BADGE_META[b].label}
        </span>
      ))}
    </span>
  );
}

function TodayRow({
  card,
  reorder,
}: {
  card: TodayCard;
  reorder?: { onUp: () => void; onDown: () => void; upDisabled: boolean; downDisabled: boolean };
}) {
  const select = useUiStore((s) => s.select);
  const setStatus = useTaskStore((s) => s.setStatus);
  const setToday = useTaskStore((s) => s.setToday);
  const statusColors = useSettingsStore((s) => s.settings.statusColors);
  const t = card.task;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColors[t.status] }} />
      <button
        className="flex-1 min-w-0 text-left text-sm text-slate-800 dark:text-slate-100 truncate hover:underline"
        onClick={() => select(t.id)}
        title={t.title}
      >
        {t.title}
      </button>
      {t.effortSize && (
        <span className="text-[10px] px-1 py-0.5 rounded font-semibold bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300 shrink-0">
          {t.effortSize}
        </span>
      )}
      <Badges badges={card.badges} />
      {reorder && (
        <span className="flex flex-col shrink-0">
          <button
            className="text-[10px] leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30"
            onClick={reorder.onUp}
            disabled={reorder.upDisabled}
            aria-label="上へ"
          >
            ▲
          </button>
          <button
            className="text-[10px] leading-none text-slate-400 hover:text-slate-700 disabled:opacity-30"
            onClick={reorder.onDown}
            disabled={reorder.downDisabled}
            aria-label="下へ"
          >
            ▼
          </button>
        </span>
      )}
      <select
        className="text-[11px] border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-1 py-0.5 shrink-0"
        value={t.status}
        onChange={(e) => void setStatus(t.id, e.target.value as Task["status"])}
        aria-label="状態を変更"
      >
        {(["todo", "doing", "pending", "waiting", "done"] as const).map((st) => (
          <option key={st} value={st}>
            {STATUS_LABELS[st]}
          </option>
        ))}
      </select>
      <button
        className="text-xs px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 shrink-0"
        onClick={() => void setStatus(t.id, "done")}
        title="完了にする"
      >
        ✓
      </button>
      {t.todayDate !== null && (
        <button
          className="text-xs px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
          onClick={() => void setToday([t.id], false)}
          title="今日やるから外す"
        >
          ×
        </button>
      )}
    </div>
  );
}

function CapacityMeter() {
  const tasks = useTaskStore((s) => s.tasks);
  const settings = useSettingsStore((s) => s.settings);
  const today = localToday();
  const groups = useMemo(
    () => todayGroups(tasks, today, settings.todayIncludeUrgentQuadrant),
    [tasks, today, settings.todayIncludeUrgentQuadrant],
  );
  const cap = capacitySummary(groups, settings.effortMinutes, settings.dailyCapacityMinutes);
  const pct = Math.min(100, Math.round((cap.estimatedMinutes / Math.max(1, cap.capacityMinutes)) * 100));

  return (
    <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-slate-500 dark:text-slate-400">本日の容量</span>
        <span className={cap.over ? "text-red-600 dark:text-red-400 font-bold" : "text-slate-600 dark:text-slate-300"}>
          見積り {cap.estimatedMinutes}分 / 可処分 {cap.capacityMinutes}分
          {cap.unestimatedCount > 0 && (
            <span className="ml-2 text-slate-400">({cap.unestimatedCount}件 未見積り)</span>
          )}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
        <div
          className={`h-full ${cap.over ? "bg-red-500" : "bg-indigo-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {cap.over && (
        <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
          可処分時間を {-cap.remainingMinutes}分 超過しています。
        </p>
      )}
    </div>
  );
}

export function TodayView() {
  const tasks = useTaskStore((s) => s.tasks);
  const setToday = useTaskStore((s) => s.setToday);
  const reorderToday = useTaskStore((s) => s.reorderToday);
  const includeUrgent = useSettingsStore((s) => s.settings.todayIncludeUrgentQuadrant);
  const setView = useUiStore((s) => s.setView);
  const today = localToday();

  const groups = useMemo(
    () => todayGroups(tasks, today, includeUrgent),
    [tasks, today, includeUrgent],
  );

  // 選択グループが空のとき: 第2領域(計画する)から引き込む候補
  const q2Candidates = useMemo(
    () =>
      tasks
        .filter((t) => !t.deletedAt && t.status !== "done" && t.todayDate === null && taskQuadrant(t) === "q2")
        .slice(0, 8),
    [tasks],
  );

  const moveInPicks = (index: number, dir: -1 | 1) => {
    const ids = groups.picks.map((c) => c.task.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    void reorderToday(ids);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-slate-50 dark:bg-slate-900">
      <CapacityMeter />
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* グループA: 締切・進行中(自動) */}
        <section>
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
            締切・進行中(自動) <span className="text-slate-400">{groups.auto.length}</span>
          </h2>
          {groups.auto.length === 0 ? (
            <p className="text-xs text-slate-400">締切や進行中のタスクはありません。</p>
          ) : (
            <div className="space-y-1.5">
              {groups.auto.map((c) => (
                <TodayRow key={c.task.id} card={c} />
              ))}
            </div>
          )}
        </section>

        {/* グループB: 今日やる(選択) */}
        <section>
          <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
            今日やる(選択) <span className="text-slate-400">{groups.picks.length}</span>
          </h2>
          {groups.picks.length === 0 ? (
            <div className="text-xs text-slate-400 space-y-2">
              <p>「今日やる」に指定したタスクはありません。第2領域(計画する)から引き込みましょう。</p>
              {q2Candidates.length > 0 ? (
                <div className="space-y-1">
                  {q2Candidates.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded border border-dashed border-slate-300 dark:border-slate-600"
                    >
                      <span className="flex-1 min-w-0 truncate text-slate-600 dark:text-slate-300">{t.title}</span>
                      <button
                        className="text-[11px] px-2 py-0.5 rounded text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 shrink-0"
                        onClick={() => void setToday([t.id], true)}
                      >
                        ＋ 今日やる
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  className="text-[11px] px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => setView("matrix")}
                >
                  マトリクスを開く
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {groups.picks.map((c, i) => (
                <TodayRow
                  key={c.task.id}
                  card={c}
                  reorder={{
                    onUp: () => moveInPicks(i, -1),
                    onDown: () => moveInPicks(i, 1),
                    upDisabled: i === 0,
                    downDisabled: i === groups.picks.length - 1,
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
