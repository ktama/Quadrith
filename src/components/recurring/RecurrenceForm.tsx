// 繰り返しルールの編集フォーム(仕様 §4.7)。
// 詳細パネルのひな型化と、繰り返しビューの新規/編集で共用する。

import { RECUR_FREQ_LABELS, type RecurFreq } from "../../types/models";

export interface RecurrenceRule {
  freq: RecurFreq;
  interval: number;
  byweekday: number[]; // ISO 1=月〜7=日
  bymonthday: number | null;
  anchorDate: string; // 'YYYY-MM-DD'
}

const FREQS: RecurFreq[] = ["daily", "weekly", "monthly", "yearly"];
const UNIT: Record<RecurFreq, string> = {
  daily: "日",
  weekly: "週",
  monthly: "ヶ月",
  yearly: "年",
};
// ISO 1=月 の並び
const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: "月" },
  { iso: 2, label: "火" },
  { iso: 3, label: "水" },
  { iso: 4, label: "木" },
  { iso: 5, label: "金" },
  { iso: 6, label: "土" },
  { iso: 7, label: "日" },
];

export function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

// anchorDate の ISO 曜日(weekly のデフォルト用)
export function isoWeekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

export function defaultRule(): RecurrenceRule {
  const anchorDate = todayStr();
  return {
    freq: "weekly",
    interval: 1,
    byweekday: [isoWeekdayOf(anchorDate)],
    bymonthday: null,
    anchorDate,
  };
}

export function RecurrenceForm({
  value,
  onChange,
}: {
  value: RecurrenceRule;
  onChange: (r: RecurrenceRule) => void;
}) {
  const set = (patch: Partial<RecurrenceRule>) => onChange({ ...value, ...patch });

  const toggleWeekday = (iso: number) => {
    const has = value.byweekday.includes(iso);
    const next = has
      ? value.byweekday.filter((d) => d !== iso)
      : [...value.byweekday, iso].sort((a, b) => a - b);
    set({ byweekday: next.length ? next : [iso] }); // 最低1つは残す
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* 頻度 */}
      <div className="flex flex-wrap gap-1">
        {FREQS.map((f) => (
          <button
            key={f}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              value.freq === f
                ? "bg-indigo-500 text-white border-transparent"
                : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600"
            }`}
            onClick={() => set({ freq: f })}
          >
            {RECUR_FREQ_LABELS[f]}
          </button>
        ))}
      </div>

      {/* 間隔 */}
      <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <span>間隔</span>
        <input
          type="number"
          min={1}
          className="w-14 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-blue-400"
          value={value.interval}
          onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })}
        />
        <span>{UNIT[value.freq]}ごと</span>
      </div>

      {/* weekly: 曜日選択 */}
      {value.freq === "weekly" && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((w) => (
            <button
              key={w.iso}
              className={`w-7 h-7 text-xs rounded-full border transition-colors ${
                value.byweekday.includes(w.iso)
                  ? "bg-indigo-500 text-white border-transparent"
                  : "bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 border-slate-300 dark:border-slate-600"
              }`}
              onClick={() => toggleWeekday(w.iso)}
            >
              {w.label}
            </button>
          ))}
        </div>
      )}

      {/* monthly: 日付選択 */}
      {value.freq === "monthly" && (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <span>毎月</span>
          <input
            type="number"
            min={1}
            max={31}
            className="w-14 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-blue-400"
            value={value.bymonthday ?? isoMonthDay(value.anchorDate)}
            onChange={(e) =>
              set({ bymonthday: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })
            }
          />
          <span>日(無い月は末日)</span>
        </div>
      )}

      {/* 起点日 */}
      <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <span>{value.freq === "yearly" ? "毎年この日付" : "開始日"}</span>
        <input
          type="date"
          className="border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-2 py-1 focus:outline-blue-400"
          value={value.anchorDate}
          onChange={(e) => set({ anchorDate: e.target.value || todayStr() })}
        />
      </div>
    </div>
  );
}

function isoMonthDay(dateStr: string): number {
  return Number(dateStr.split("-")[2]) || 1;
}

// ひな型/ルールの人間向け要約(例: 毎週 月水金 / 隔週 月 / 毎月15日)
export function describeRule(r: {
  freq: RecurFreq;
  interval: number;
  byweekday: number[];
  bymonthday: number | null;
  anchorDate: string;
}): string {
  const n = Math.max(1, r.interval);
  if (r.freq === "daily") return n === 1 ? "毎日" : `${n}日ごと`;
  if (r.freq === "weekly") {
    const days = (r.byweekday.length ? r.byweekday : [isoWeekdayOf(r.anchorDate)])
      .sort((a, b) => a - b)
      .map((d) => WEEKDAYS.find((w) => w.iso === d)?.label ?? "")
      .join("");
    return `${n === 1 ? "毎週" : `${n}週ごと`} ${days}`;
  }
  if (r.freq === "monthly") {
    const day = r.bymonthday ?? isoMonthDay(r.anchorDate);
    return `${n === 1 ? "毎月" : `${n}ヶ月ごと`} ${day}日`;
  }
  const [, m, d] = r.anchorDate.split("-");
  return `${n === 1 ? "毎年" : `${n}年ごと`} ${Number(m)}/${Number(d)}`;
}
