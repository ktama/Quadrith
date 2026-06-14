// 定期タスクの発生日計算(仕様 §4.7、設計書 §5.7)。
// ここは純粋関数のみ(vitest 対象)。DB アクセスや副作用は templateStore が担う。
//
// 基準は「固定スケジュール型」: 前回完了が遅れても次回日付は anchorDate からの
// 規則だけで決まる。日付は 'YYYY-MM-DD' を UTC ベースで扱い、TZ 非依存とする。

import type { RecurringTemplate } from "../types/models";

const DAY = 86_400_000;

function toUtc(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fmt(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysStr(dateStr: string, n: number): string {
  return fmt(toUtc(dateStr) + n * DAY);
}

// ISO 曜日(1=月〜7=日)
function isoWeekday(ms: number): number {
  return ((new Date(ms).getUTCDay() + 6) % 7) + 1;
}

function mondayOnOrBefore(ms: number): number {
  return ms - (isoWeekday(ms) - 1) * DAY;
}

// y/m1(1-12)/day の日付。day がその月に無ければ末日へ丸める。
function clampDay(y: number, m1: number, day: number): number {
  const dim = new Date(Date.UTC(y, m1, 0)).getUTCDate();
  return Date.UTC(y, m1 - 1, Math.min(day, dim));
}

// from(含む)以降で最初の発生日。無ければ null(無限系列なので通常は探索上限のみ)。
export function nextOnOrAfter(t: RecurringTemplate, from: string): string | null {
  const fromMs = toUtc(from);
  const anchorMs = toUtc(t.anchorDate);
  const interval = Math.max(1, Math.floor(t.interval));
  // 起点日より前は対象外
  const baseMs = Math.max(fromMs, anchorMs);

  if (t.freq === "daily") {
    if (baseMs === anchorMs) return fmt(anchorMs);
    const diff = Math.round((baseMs - anchorMs) / DAY);
    const k = Math.ceil(diff / interval);
    return fmt(anchorMs + k * interval * DAY);
  }

  if (t.freq === "weekly") {
    const days = (t.byweekday.length ? [...t.byweekday] : [isoWeekday(anchorMs)])
      .filter((d) => d >= 1 && d <= 7)
      .sort((a, b) => a - b);
    const anchorWeek = mondayOnOrBefore(anchorMs);
    let weekStart = Math.max(mondayOnOrBefore(baseMs), anchorWeek);
    for (let i = 0; i < 520; i++) {
      const weeksSince = Math.round((weekStart - anchorWeek) / (7 * DAY));
      const rem = ((weeksSince % interval) + interval) % interval;
      if (rem === 0) {
        for (const d of days) {
          const cand = weekStart + (d - 1) * DAY;
          if (cand >= baseMs) return fmt(cand);
        }
        weekStart += interval * 7 * DAY;
      } else {
        weekStart += (interval - rem) * 7 * DAY;
      }
    }
    return null;
  }

  if (t.freq === "monthly") {
    const day = t.bymonthday ?? new Date(anchorMs).getUTCDate();
    const anchorIdx =
      new Date(anchorMs).getUTCFullYear() * 12 + new Date(anchorMs).getUTCMonth();
    const bd = new Date(baseMs);
    let idx = bd.getUTCFullYear() * 12 + bd.getUTCMonth();
    const rem = ((idx - anchorIdx) % interval + interval) % interval;
    if (rem !== 0) idx += interval - rem;
    for (let i = 0; i < 600; i++) {
      const cand = clampDay(Math.floor(idx / 12), (idx % 12) + 1, day);
      if (cand >= baseMs) return fmt(cand);
      idx += interval;
    }
    return null;
  }

  // yearly: anchor の月日を interval 年ごと
  const ad = new Date(anchorMs);
  const month = ad.getUTCMonth() + 1;
  const day = ad.getUTCDate();
  const anchorYear = ad.getUTCFullYear();
  let y = new Date(baseMs).getUTCFullYear();
  const rem = ((y - anchorYear) % interval + interval) % interval;
  if (rem !== 0) y += interval - rem;
  for (let i = 0; i < 200; i++) {
    const cand = clampDay(y, month, day);
    if (cand >= baseMs) return fmt(cand);
    y += interval;
  }
  return null;
}

// テンプレート作成時の初期 next_due(= anchorDate 以降で最初の発生日)。
export function initialNextDue(t: RecurringTemplate): string {
  return nextOnOrAfter(t, t.anchorDate) ?? t.anchorDate;
}

export interface GenerationPlan {
  due: boolean; // 今日までに発生したか(=実体を生成すべきか)
  dueDate: string | null; // 生成する実体の期限(= 直近の発生日)。due=false なら null
  nextDue: string; // 更新後の next_due
}

// today までの発生分を評価する。複数回該当しても「まとめて1件」とし、
// dueDate は直近の発生日、next_due は today より後の最初の発生日へ前進する。
export function planGeneration(t: RecurringTemplate, today: string): GenerationPlan {
  const first = nextOnOrAfter(t, t.nextDue);
  if (first === null) return { due: false, dueDate: null, nextDue: t.nextDue };
  if (first > today) return { due: false, dueDate: null, nextDue: first };

  let last = first;
  for (let i = 0; i < 4000; i++) {
    const nxt = nextOnOrAfter(t, addDaysStr(last, 1));
    if (nxt === null || nxt > today) {
      return { due: true, dueDate: last, nextDue: nxt ?? addDaysStr(last, 1) };
    }
    last = nxt;
  }
  // 安全弁(極端なギャップ): 直近を today 扱いにして打ち切る
  return { due: true, dueDate: last, nextDue: addDaysStr(today, 1) };
}
