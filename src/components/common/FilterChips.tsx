// 状態フィルタ(仕様書 §4.2)— トグルチップ、複数選択可

import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";
import { STATUSES, STATUS_LABELS } from "../../types/models";

export function FilterChips() {
  const statusFilter = useUiStore((s) => s.statusFilter);
  const toggle = useUiStore((s) => s.toggleStatusFilter);
  const statusColors = useSettingsStore((s) => s.settings.statusColors);

  return (
    <div className="flex gap-1.5">
      {STATUSES.map((s) => {
        const active = statusFilter.includes(s);
        return (
          <button
            key={s}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              active
                ? "text-white border-transparent"
                : "bg-white dark:bg-slate-700 text-slate-400 dark:text-slate-300 border-slate-300 dark:border-slate-600"
            }`}
            style={active ? { background: statusColors[s] } : {}}
            onClick={() => toggle(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}
