// 週次レビュー・ウィザード(仕様 §4.11)
// 6ステップを順に辿り、各ステップで既存ストア操作をその場で行えるオーバーレイ。
// 対象抽出は純粋関数 lib/review、サマリは lib/stats に委譲する。

import { useMemo, useState } from "react";
import {
  REVIEW_STEPS,
  REVIEW_STEP_LABELS,
  dueBacklog,
  dueForWeeklyReview,
  inboxTasks,
  reviewBacklog,
  staleQ2,
  type ReviewStep,
} from "../../lib/review";
import {
  planAdherenceByWeek,
  quadrantBalanceByWeek,
  throughputByWeek,
  weekStartOf,
} from "../../lib/stats";
import { QUADRANT_LABELS, type Quadrant } from "../../lib/quadrant";
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

function localTimeHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// 象限ごとの代表座標(中心寄り)。importance=上が高 / urgency=右が高。
const QUADRANT_COORD: Record<Quadrant, { imp: number; urg: number }> = {
  q1: { imp: 0.75, urg: 0.75 },
  q2: { imp: 0.75, urg: 0.25 },
  q3: { imp: 0.25, urg: 0.75 },
  q4: { imp: 0.25, urg: 0.25 },
};

function TaskLine({ task, children }: { task: Task; children?: React.ReactNode }) {
  const select = useUiStore((s) => s.select);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700">
      <button
        className="flex-1 min-w-0 truncate text-left text-sm text-slate-700 dark:text-slate-200 hover:underline"
        onClick={() => select(task.id)}
        title={task.title}
      >
        {task.title}
      </button>
      {children}
    </div>
  );
}

function SummaryStep({ today }: { today: string }) {
  const tasks = useTaskStore((s) => s.tasks);
  const settings = useSettingsStore((s) => s.settings);
  const thisWeek = weekStartOf(today, settings.weekStart);
  const lastWeek = weekStartOf(
    new Date(new Date(`${thisWeek}T00:00:00Z`).getTime() - 7 * 86_400_000).toISOString().slice(0, 10),
    settings.weekStart,
  );

  const throughput = throughputByWeek(tasks, settings.effortMinutes, settings.weekStart);
  const adherence = planAdherenceByWeek(tasks, settings.weekStart);
  const balance = quadrantBalanceByWeek(tasks, settings.weekStart);
  const tw = throughput.find((b) => b.week === thisWeek);
  const lw = throughput.find((b) => b.week === lastWeek);
  const adh = adherence.find((b) => b.week === thisWeek);
  const bal = balance.find((b) => b.week === thisWeek);

  return (
    <div className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded bg-slate-100 dark:bg-slate-700/50">
          <div className="text-xs text-slate-500 dark:text-slate-400">今週の完了</div>
          <div className="text-lg font-bold">{tw?.count ?? 0}件 / {tw?.minutes ?? 0}分</div>
          <div className="text-[11px] text-slate-400">先週: {lw?.count ?? 0}件 / {lw?.minutes ?? 0}分</div>
        </div>
        <div className="p-3 rounded bg-slate-100 dark:bg-slate-700/50">
          <div className="text-xs text-slate-500 dark:text-slate-400">計画遵守率(今週)</div>
          <div className="text-lg font-bold">
            {adh ? `${Math.round(adh.ratio * 100)}%` : "—"}
          </div>
          <div className="text-[11px] text-slate-400">{adh ? `${adh.completed}/${adh.planned} 件` : "計画なし"}</div>
        </div>
      </div>
      <div className="p-3 rounded bg-slate-100 dark:bg-slate-700/50">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">象限バランス(今週の完了)</div>
        {bal ? (
          <div className="flex gap-3 text-xs">
            {(["q1", "q2", "q3", "q4"] as Quadrant[]).map((q) => (
              <span key={q}>
                {QUADRANT_LABELS[q]}: <b>{Math.round(bal.ratio[q] * 100)}%</b>
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-slate-400">完了タスクなし</span>
        )}
      </div>
    </div>
  );
}

function DueStep({ today }: { today: string }) {
  const tasks = useTaskStore((s) => s.tasks);
  const weekStart = useSettingsStore((s) => s.settings.weekStart);
  const patch = useTaskStore((s) => s.patch);
  const setStatus = useTaskStore((s) => s.setStatus);
  const setToday = useTaskStore((s) => s.setToday);
  const list = useMemo(() => dueBacklog(tasks, today, weekStart), [tasks, today, weekStart]);

  if (list.length === 0) return <Empty>棚卸しが必要な期限はありません。</Empty>;
  return (
    <div className="space-y-1.5">
      {list.map((t) => (
        <TaskLine key={t.id} task={t}>
          <input
            type="date"
            className="text-[11px] border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded px-1 shrink-0"
            value={t.dueDate ?? ""}
            onChange={(e) => void patch(t.id, { dueDate: e.target.value || null })}
          />
          <ActionBtn onClick={() => void setToday([t.id], true)}>今日やる</ActionBtn>
          <ActionBtn onClick={() => void setStatus(t.id, "done")} tone="ok">完了</ActionBtn>
        </TaskLine>
      ))}
    </div>
  );
}

function StaleStep() {
  const tasks = useTaskStore((s) => s.tasks);
  const moveTo = useTaskStore((s) => s.moveTo);
  const setToday = useTaskStore((s) => s.setToday);
  const remove = useTaskStore((s) => s.remove);
  const list = useMemo(() => staleQ2(tasks, Date.now()), [tasks]);

  if (list.length === 0) return <Empty>放置中の第2領域タスクはありません。</Empty>;
  return (
    <div className="space-y-1.5">
      {list.map((t) => (
        <TaskLine key={t.id} task={t}>
          <ActionBtn onClick={() => void moveTo(t.id, t.importance ?? 0.75, 0.75)}>緊急へ</ActionBtn>
          <ActionBtn onClick={() => void setToday([t.id], true)}>計画</ActionBtn>
          <ActionBtn onClick={() => void remove(t.id)} tone="danger">破棄</ActionBtn>
        </TaskLine>
      ))}
    </div>
  );
}

function ReviewStepBody({ today }: { today: string }) {
  const tasks = useTaskStore((s) => s.tasks);
  const patch = useTaskStore((s) => s.patch);
  const setStatus = useTaskStore((s) => s.setStatus);
  const list = useMemo(() => reviewBacklog(tasks, today), [tasks, today]);

  if (list.length === 0) return <Empty>再確認が必要な保留・待ちはありません。</Empty>;
  return (
    <div className="space-y-1.5">
      {list.map((t) => (
        <TaskLine key={t.id} task={t}>
          <span className="text-[10px] text-slate-400 shrink-0">{STATUS_LABELS[t.status]}</span>
          <input
            type="date"
            className="text-[11px] border border-slate-200 dark:border-slate-600 dark:bg-slate-700 rounded px-1 shrink-0"
            value={t.reviewAt ?? ""}
            onChange={(e) => void patch(t.id, { reviewAt: e.target.value || null })}
          />
          <ActionBtn onClick={() => void setStatus(t.id, "doing")}>再開</ActionBtn>
          <ActionBtn onClick={() => void setStatus(t.id, "done")} tone="ok">完了</ActionBtn>
        </TaskLine>
      ))}
    </div>
  );
}

function InboxStep() {
  const tasks = useTaskStore((s) => s.tasks);
  const moveTo = useTaskStore((s) => s.moveTo);
  const remove = useTaskStore((s) => s.remove);
  const list = useMemo(() => inboxTasks(tasks), [tasks]);

  if (list.length === 0) return <Empty>未仕分けのタスクはありません。</Empty>;
  return (
    <div className="space-y-1.5">
      {list.map((t) => (
        <TaskLine key={t.id} task={t}>
          {(["q1", "q2", "q3", "q4"] as Quadrant[]).map((q) => (
            <ActionBtn
              key={q}
              onClick={() => void moveTo(t.id, QUADRANT_COORD[q].imp, QUADRANT_COORD[q].urg)}
            >
              {QUADRANT_LABELS[q]}
            </ActionBtn>
          ))}
          <ActionBtn onClick={() => void remove(t.id)} tone="danger">削除</ActionBtn>
        </TaskLine>
      ))}
    </div>
  );
}

function PlanStep() {
  const tasks = useTaskStore((s) => s.tasks);
  const setToday = useTaskStore((s) => s.setToday);
  const today = localToday();
  const candidates = useMemo(
    () =>
      tasks
        .filter((t) => !t.deletedAt && t.status !== "done")
        .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
        .slice(0, 20),
    [tasks],
  );

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-slate-400">来週に向けて「今日やる」を仕込みます。</p>
      {candidates.map((t) => {
        const on = t.todayDate === today;
        return (
          <TaskLine key={t.id} task={t}>
            <ActionBtn onClick={() => void setToday([t.id], !on)} tone={on ? "ok" : undefined}>
              {on ? "★ 解除" : "☆ 今日やる"}
            </ActionBtn>
          </TaskLine>
        );
      })}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-400 py-4 text-center">{children}</p>;
}

function ActionBtn({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "ok" | "danger";
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
      : tone === "danger"
        ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
        : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30";
  return (
    <button className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 ${cls}`} onClick={onClick}>
      {children}
    </button>
  );
}

export function ReviewWizard() {
  const open = useUiStore((s) => s.reviewOpen);
  const setOpen = useUiStore((s) => s.setReviewOpen);
  const updateSetting = useSettingsStore((s) => s.update);
  const [stepIdx, setStepIdx] = useState(0);
  const today = localToday();

  if (!open) return null;

  const step: ReviewStep = REVIEW_STEPS[stepIdx];
  const isLast = stepIdx === REVIEW_STEPS.length - 1;

  const close = () => {
    setOpen(false);
    setStepIdx(0);
  };
  const finish = () => {
    void updateSetting("lastReviewAt", new Date().toISOString());
    close();
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="w-[42rem] max-w-[92vw] max-h-[80vh] flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              週次レビュー — {REVIEW_STEP_LABELS[step]}
            </h2>
            <p className="text-[11px] text-slate-400">
              ステップ {stepIdx + 1} / {REVIEW_STEPS.length}
            </p>
          </div>
          <button className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" onClick={close}>
            ×
          </button>
        </div>

        {/* 進捗バー */}
        <div className="h-1 bg-slate-100 dark:bg-slate-700">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${((stepIdx + 1) / REVIEW_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === "summary" && <SummaryStep today={today} />}
          {step === "due" && <DueStep today={today} />}
          {step === "stale" && <StaleStep />}
          {step === "review" && <ReviewStepBody today={today} />}
          {step === "inbox" && <InboxStep />}
          {step === "plan" && <PlanStep />}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-700">
          <button
            className="text-xs px-3 py-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
            disabled={stepIdx === 0}
          >
            戻る
          </button>
          <div className="flex gap-2">
            {!isLast && (
              <button
                className="text-xs px-3 py-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                onClick={() => setStepIdx((i) => Math.min(REVIEW_STEPS.length - 1, i + 1))}
              >
                スキップ
              </button>
            )}
            {isLast ? (
              <button
                className="text-xs px-4 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-white font-medium"
                onClick={finish}
              >
                レビューを完了
              </button>
            ) : (
              <button
                className="text-xs px-4 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-white font-medium"
                onClick={() => setStepIdx((i) => Math.min(REVIEW_STEPS.length - 1, i + 1))}
              >
                次へ
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 毎週リマインドのアプリ内バナー(仕様 §4.11)。Rust スケジューラは使わない。
export function ReviewBanner() {
  const setOpen = useUiStore((s) => s.setReviewOpen);
  const settings = useSettingsStore((s) => s.settings);
  const [dismissed, setDismissed] = useState(false);
  const today = localToday();

  const due = dueForWeeklyReview(
    settings.weeklyReview,
    today,
    localTimeHHmm(),
    settings.lastReviewAt,
    settings.weekStart,
  );
  if (!due || dismissed) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-200 dark:border-indigo-800 text-xs text-indigo-800 dark:text-indigo-200">
      <span>📋 今週の週次レビューがまだです。</span>
      <button
        className="px-2 py-0.5 rounded bg-indigo-500 hover:bg-indigo-600 text-white"
        onClick={() => setOpen(true)}
      >
        開始する
      </button>
      <button className="ml-auto text-indigo-400 hover:text-indigo-700" onClick={() => setDismissed(true)}>
        後で
      </button>
    </div>
  );
}
