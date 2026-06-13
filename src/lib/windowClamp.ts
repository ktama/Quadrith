// 復元ウィンドウのモニタ内クランプ(改善 #4)。純粋関数(テスト対象)。

import type { WindowState } from "../types/models";

export interface MonitorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ウィンドウが少なくともこれだけ可視ならOK(タイトルバーを掴める最低限)
const MIN_VISIBLE_W = 80;
const MIN_VISIBLE_H = 30;

function overlap(aStart: number, aLen: number, bStart: number, bLen: number): number {
  return Math.max(0, Math.min(aStart + aLen, bStart + bLen) - Math.max(aStart, bStart));
}

// 保存ウィンドウがどのモニタにも十分乗っていなければ、先頭モニタ中央へ寄せる。
// モニタ情報が無ければそのまま返す。
export function clampWindowToMonitors(w: WindowState, monitors: MonitorRect[]): WindowState {
  if (monitors.length === 0) return w;
  const visible = monitors.some(
    (m) =>
      overlap(w.x, w.width, m.x, m.width) >= MIN_VISIBLE_W &&
      overlap(w.y, w.height, m.y, m.height) >= MIN_VISIBLE_H,
  );
  if (visible) return w;

  const m = monitors[0];
  const width = Math.min(w.width, m.width);
  const height = Math.min(w.height, m.height);
  return {
    width,
    height,
    x: m.x + Math.max(0, Math.round((m.width - width) / 2)),
    y: m.y + Math.max(0, Math.round((m.height - height) / 2)),
  };
}
