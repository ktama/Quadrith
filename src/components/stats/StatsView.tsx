// 統計ビュー(仕様書 フェーズ3)
// 完了タスクの象限分布を、マトリクスと同じ2×2の並びで可視化する。
// 「緊急対応に追われていないか」= 緊急象限(Q1+Q3)の割合をヘッドラインで示す。
// データ系の機能としてエクスポート(JSON/CSV)もここに置く。

import { useMemo, useState } from "react";
import { exportData, exportRedmineCsv, type ExportFormat } from "../../lib/exportFile";
import { todayLocal } from "../../lib/notifications";
import { QUADRANT_GRID_ORDER, QUADRANT_LABELS, type Quadrant } from "../../lib/quadrant";
import { addDaysStr } from "../../lib/recurrence";
import {
  completionStats,
  createdVsCompletedByWeek,
  oldestTodos,
  planAdherenceByWeek,
  q2LeadTimeMedianDays,
  q2StaleTop,
  throughputByWeek,
  unestimatedRatio,
} from "../../lib/stats";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useToastStore } from "../../stores/toastStore";
import { useUiStore } from "../../stores/uiStore";

const QUADRANT_TONE: Record<Quadrant, string> = {
  q1: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900",
  q2: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900",
  q3: "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900",
  q4: "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700",
};
const QUADRANT_BAR: Record<Quadrant, string> = {
  q1: "bg-red-400",
  q2: "bg-blue-400",
  q3: "bg-amber-400",
  q4: "bg-slate-400",
};

function pct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function StatsView() {
  const tasks = useTaskStore((s) => s.tasks);
  const settings = useSettingsStore((s) => s.settings);
  const redmineMapping = settings.redmineExport;
  const setReviewOpen = useUiStore((s) => s.setReviewOpen);
  const show = useToastStore((s) => s.show);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [redmineFrom, setRedmineFrom] = useState(todayLocal());
  const [redmineTo, setRedmineTo] = useState(addDaysStr(todayLocal(), 30));
  const [redmineBusy, setRedmineBusy] = useState(false);

  const stats = useMemo(() => completionStats(tasks), [tasks]);
  // 深掘り指標(仕様 §4.11)。週起点・工数換算は設定に追従する。
  const deep = useMemo(() => {
    const throughput = throughputByWeek(tasks, settings.effortMinutes, settings.weekStart).slice(-6);
    const created = createdVsCompletedByWeek(tasks, settings.weekStart).slice(-6);
    const adherence = planAdherenceByWeek(tasks, settings.weekStart).slice(-6);
    return {
      throughput,
      created,
      adherence,
      leadTime: q2LeadTimeMedianDays(tasks),
      unestimated: unestimatedRatio(tasks),
      oldest: oldestTodos(tasks, 5),
      stale: q2StaleTop(tasks, Date.now(), 5),
    };
  }, [tasks, settings.effortMinutes, settings.weekStart]);
  const byQ = useMemo(
    () => Object.fromEntries(stats.stats.map((s) => [s.quadrant, s])) as Record<
      Quadrant,
      (typeof stats.stats)[number]
    >,
    [stats],
  );

  const runExport = async (format: ExportFormat) => {
    setExporting(format);
    const res = await exportData(format);
    setExporting(null);
    if (!res.ok) {
      show(res.error.message, { kind: "error" });
    } else if (res.value) {
      show(`${format.toUpperCase()} をエクスポートしました`);
    }
  };

  const runRedmineExport = async () => {
    if (redmineFrom > redmineTo) {
      show("開始日は終了日以前にしてください", { kind: "error" });
      return;
    }
    setRedmineBusy(true);
    const res = await exportRedmineCsv({ from: redmineFrom, to: redmineTo }, redmineMapping);
    setRedmineBusy(false);
    if (!res.ok) {
      show(res.error.message, { kind: "error" });
    } else if (res.value.kind === "empty") {
      show("期間内に対象タスクがありません", { kind: "error" });
    } else if (res.value.kind === "saved") {
      show(`Redmine CSV を出力しました(${res.value.count} 件)`);
    }
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-slate-900 p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-700 dark:text-slate-100">
            完了タスクの象限分布
          </h2>
          <div className="flex gap-2">
            <button
              className="text-xs px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-white font-medium"
              onClick={() => setReviewOpen(true)}
            >
              週次レビュー
            </button>
            {(["json", "csv"] as const).map((fmt) => (
              <button
                key={fmt}
                disabled={exporting !== null}
                className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-600 disabled:opacity-50"
                onClick={() => void runExport(fmt)}
              >
                {exporting === fmt ? "出力中..." : `${fmt.toUpperCase()} エクスポート`}
              </button>
            ))}
          </div>
        </div>

        {/* Redmine 取込用 CSV(期間指定。未完了 + 期間内の繰り返しを出力) */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-200">
              Redmine エクスポート
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
              <input
                type="date"
                value={redmineFrom}
                onChange={(e) => setRedmineFrom(e.target.value)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100"
              />
              <span>〜</span>
              <input
                type="date"
                value={redmineTo}
                onChange={(e) => setRedmineTo(e.target.value)}
                className="px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100"
              />
              <button
                disabled={redmineBusy}
                className="text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-600 disabled:opacity-50"
                onClick={() => void runRedmineExport()}
              >
                {redmineBusy ? "出力中..." : "Redmine CSV"}
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            未完了タスク(期日が期間内)と、期間内に発生する繰り返しを Redmine 取込用 CSV
            に出力します。トラッカー名・ステータス/優先度のマッピングは設定画面で変更できます。
          </p>
        </div>

        {stats.total === 0 ? (
          <p className="text-sm text-slate-400 py-12 text-center">
            集計対象の完了タスクがまだありません。
            <br />
            マトリクスに配置したタスクを完了すると、ここに分布が表示されます。
          </p>
        ) : (
          <>
            {/* ヘッドライン: 緊急対応に追われていないか */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 flex items-center gap-6">
              <div>
                <div className="text-3xl font-bold text-slate-700 dark:text-slate-100">
                  {stats.total}
                </div>
                <div className="text-xs text-slate-400">完了タスク総数</div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>緊急対応(今すぐやる / さばく・任せる)</span>
                  <span className="font-bold">{pct(stats.urgentRatio)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full bg-red-400"
                    style={{ width: pct(stats.urgentRatio) }}
                  />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  {stats.urgentRatio >= 0.5
                    ? "完了の半分以上が緊急象限です。第2領域(計画する)に時間を割けているか見直しましょう。"
                    : "緊急対応は半分未満。計画的にタスクを処理できています。"}
                </p>
              </div>
            </div>

            {/* マトリクスと同じ並びの 2×2 グリッド */}
            <div className="grid grid-cols-2 gap-3">
              {QUADRANT_GRID_ORDER.map((q) => {
                const cell = byQ[q];
                return (
                  <div key={q} className={`rounded-lg border p-4 ${QUADRANT_TONE[q]}`}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                        {QUADRANT_LABELS[q]}
                      </span>
                      <span className="text-2xl font-bold text-slate-700 dark:text-slate-100">
                        {cell.count}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-white/70 dark:bg-slate-900/50 overflow-hidden">
                      <div
                        className={`h-full ${QUADRANT_BAR[q]}`}
                        style={{ width: pct(cell.ratio) }}
                      />
                    </div>
                    <div className="text-right text-xs text-slate-400 mt-1">{pct(cell.ratio)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* 深掘り指標(仕様 §4.11) */}
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold text-slate-700 dark:text-slate-100">指標の深掘り</h2>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="text-xs text-slate-400">第2領域リードタイム(中央値)</div>
              <div className="text-2xl font-bold text-slate-700 dark:text-slate-100">
                {deep.leadTime === null ? "—" : `${deep.leadTime}日`}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="text-xs text-slate-400">未見積り率</div>
              <div className="text-2xl font-bold text-slate-700 dark:text-slate-100">
                {pct(deep.unestimated.ratio)}
              </div>
              <div className="text-[11px] text-slate-400">
                {deep.unestimated.unestimated}/{deep.unestimated.total} 件
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="text-xs text-slate-400">計画遵守率(直近週)</div>
              <div className="text-2xl font-bold text-slate-700 dark:text-slate-100">
                {deep.adherence.length ? pct(deep.adherence[deep.adherence.length - 1].ratio) : "—"}
              </div>
            </div>
          </div>

          {/* 完了スループット + 作成 vs 完了(週次) */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-sm font-semibold text-slate-600 dark:text-slate-200 mb-2">
              週次の流量(完了スループット / 作成 vs 完了)
            </div>
            {deep.throughput.length === 0 && deep.created.length === 0 ? (
              <p className="text-xs text-slate-400">まだデータがありません。</p>
            ) : (
              <table className="w-full text-xs text-slate-600 dark:text-slate-300">
                <thead>
                  <tr className="text-slate-400">
                    <th className="text-left font-normal py-1">週(起点)</th>
                    <th className="text-right font-normal">完了</th>
                    <th className="text-right font-normal">分</th>
                    <th className="text-right font-normal">作成</th>
                    <th className="text-right font-normal">差</th>
                  </tr>
                </thead>
                <tbody>
                  {deep.created.map((c) => {
                    const tp = deep.throughput.find((t) => t.week === c.week);
                    return (
                      <tr key={c.week} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="py-1">{c.week}</td>
                        <td className="text-right">{c.completed}</td>
                        <td className="text-right">{tp?.minutes ?? 0}</td>
                        <td className="text-right">{c.created}</td>
                        <td className={`text-right ${c.diff > 0 ? "text-red-500" : "text-emerald-500"}`}>
                          {c.diff > 0 ? `+${c.diff}` : c.diff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* 最古の未着手 */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-200 mb-2">最古の未着手</div>
              {deep.oldest.length === 0 ? (
                <p className="text-xs text-slate-400">未着手タスクはありません。</p>
              ) : (
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {deep.oldest.map((t) => (
                    <li key={t.id} className="flex justify-between gap-2">
                      <span className="truncate">{t.title}</span>
                      <span className="text-slate-400 shrink-0">{t.createdAt.slice(0, 10)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* 第2領域の放置 */}
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
              <div className="text-sm font-semibold text-slate-600 dark:text-slate-200 mb-2">第2領域の放置</div>
              {deep.stale.length === 0 ? (
                <p className="text-xs text-slate-400">放置中の第2領域はありません。</p>
              ) : (
                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {deep.stale.map((s) => (
                    <li key={s.task.id} className="flex justify-between gap-2">
                      <span className="truncate">{s.task.title}</span>
                      <span className="text-slate-400 shrink-0">{s.days}日</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          ※ インボックス(座標なし)のまま完了したタスクは象限分布の集計対象外です。エクスポートは論理削除分も含む全タスクが対象です。
        </p>
      </div>
    </div>
  );
}
