// 工数(Tシャツサイズ)の換算(仕様 §4.10)
// サイズ→分の対応は設定(AppSettings.effortMinutes)で変更できる。
// 未見積り(null)は容量・時間集計に算入しないため null を返す。

import type { EffortSize } from "../types/models";

export const EFFORT_LABELS: Record<EffortSize, string> = {
  S: "S",
  M: "M",
  L: "L",
  XL: "XL",
};

// サイズ→分。未見積りは null(合計に入れない)。
export function effortToMinutes(
  size: EffortSize | null,
  map: Record<EffortSize, number>,
): number | null {
  return size === null ? null : map[size];
}

// 見積り済みタスクの工数(分)合計。未見積りは無視し、別途件数で数える想定。
export function sumEffortMinutes(
  sizes: (EffortSize | null)[],
  map: Record<EffortSize, number>,
): number {
  let total = 0;
  for (const s of sizes) {
    const m = effortToMinutes(s, map);
    if (m !== null) total += m;
  }
  return total;
}
