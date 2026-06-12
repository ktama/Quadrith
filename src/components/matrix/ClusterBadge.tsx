// 密集時のクラスタ表示(仕様書 §4.1)
// 同一箇所に4枚以上密集したカードを「+N」バッジに集約し、クリックで吹き出し展開。
// 吹き出し内のタスクをクリックすると詳細パネルが開く。

import { useSettingsStore } from "../../stores/settingsStore";
import { useTaskStore } from "../../stores/taskStore";
import { useUiStore } from "../../stores/uiStore";
import type { Cluster } from "../../lib/layout";

export function ClusterBadge({
  cluster,
  containerW,
}: {
  cluster: Cluster;
  containerW: number;
}) {
  const open = useUiStore((s) => s.openClusterId === cluster.id);
  const setOpenClusterId = useUiStore((s) => s.setOpenClusterId);
  const select = useUiStore((s) => s.select);
  const tasks = useTaskStore((s) => s.tasks);
  const statusColors = useSettingsStore((s) => s.settings.statusColors);

  const members = cluster.taskIds
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t) => t !== undefined);

  // 吹き出しが右端からはみ出す場合は左へ寄せる
  const POPOVER_W = 224;
  const popoverLeft = Math.min(cluster.x + 16, Math.max(8, containerW - POPOVER_W - 8));

  return (
    <>
      <button
        className="absolute z-20 w-9 h-9 -translate-x-1/2 -translate-y-1/2 rounded-full
          bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold shadow-md
          flex items-center justify-center select-none"
        style={{ left: cluster.x, top: cluster.y }}
        title={`${cluster.taskIds.length}件のタスク`}
        onClick={() => setOpenClusterId(open ? null : cluster.id)}
      >
        +{cluster.taskIds.length}
      </button>

      {open && (
        <div
          className="absolute z-40 bg-white border border-slate-300 rounded-lg shadow-xl p-2"
          style={{ left: popoverLeft, top: cluster.y + 16, width: POPOVER_W }}
        >
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-[11px] font-bold text-slate-500">
              {cluster.taskIds.length}件のタスク
            </span>
            <button
              className="text-slate-400 hover:text-slate-600 leading-none"
              onClick={() => setOpenClusterId(null)}
            >
              ×
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto flex flex-col">
            {members.map((t) => (
              <button
                key={t.id}
                className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-100 text-left"
                onClick={() => {
                  select(t.id);
                  setOpenClusterId(null);
                }}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: statusColors[t.status] }}
                />
                <span className="text-xs text-slate-700 truncate">{t.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
