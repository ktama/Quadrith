// 統計ビュー(仕様書 フェーズ3)
// 完了タスクの象限分布を、マトリクスと同じ2×2の並びで可視化する。
// 「緊急対応に追われていないか」= 緊急象限(Q1+Q3)の割合をヘッドラインで示す。
// データ系の機能としてエクスポート(JSON/CSV)もここに置く。

import { useMemo, useState } from "react";
import { exportData, type ExportFormat } from "../../lib/exportFile";
import { QUADRANT_GRID_ORDER, QUADRANT_LABELS, type Quadrant } from "../../lib/quadrant";
import { completionStats } from "../../lib/stats";
import { useTaskStore } from "../../stores/taskStore";
import { useToastStore } from "../../stores/toastStore";

const QUADRANT_TONE: Record<Quadrant, string> = {
  q1: "bg-red-50 border-red-200",
  q2: "bg-blue-50 border-blue-200",
  q3: "bg-amber-50 border-amber-200",
  q4: "bg-slate-50 border-slate-200",
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
  const show = useToastStore((s) => s.show);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const stats = useMemo(() => completionStats(tasks), [tasks]);
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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-700">完了タスクの象限分布</h2>
          <div className="flex gap-2">
            {(["json", "csv"] as const).map((fmt) => (
              <button
                key={fmt}
                disabled={exporting !== null}
                className="text-xs px-3 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50"
                onClick={() => void runExport(fmt)}
              >
                {exporting === fmt ? "出力中..." : `${fmt.toUpperCase()} エクスポート`}
              </button>
            ))}
          </div>
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
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center gap-6">
              <div>
                <div className="text-3xl font-bold text-slate-700">{stats.total}</div>
                <div className="text-xs text-slate-400">完了タスク総数</div>
              </div>
              <div className="flex-1">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>緊急対応(今すぐやる / さばく・任せる)</span>
                  <span className="font-bold">{pct(stats.urgentRatio)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
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
                      <span className="text-sm font-semibold text-slate-600">
                        {QUADRANT_LABELS[q]}
                      </span>
                      <span className="text-2xl font-bold text-slate-700">{cell.count}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-white/70 overflow-hidden">
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

        <p className="text-xs text-slate-400">
          ※ インボックス(座標なし)のまま完了したタスクは集計対象外です。エクスポートは論理削除分も含む全タスクが対象です。
        </p>
      </div>
    </div>
  );
}
