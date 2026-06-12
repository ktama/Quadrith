// 正規化座標(0.0〜1.0)とピクセル座標の相互変換。
// importance: 縦軸(上が高い) / urgency: 横軸(右が高い)
// ピクセル座標はカードの左上を指し、カードが必ずコンテナ内に収まる範囲に写像する。

export const CARD_W = 144;
export const CARD_H = 60;

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function normToPx(
  importance: number,
  urgency: number,
  containerW: number,
  containerH: number,
  cardW = CARD_W,
  cardH = CARD_H,
): { x: number; y: number } {
  return {
    x: clamp01(urgency) * Math.max(0, containerW - cardW),
    y: (1 - clamp01(importance)) * Math.max(0, containerH - cardH),
  };
}

export function pxToNorm(
  x: number,
  y: number,
  containerW: number,
  containerH: number,
  cardW = CARD_W,
  cardH = CARD_H,
): { importance: number; urgency: number } {
  const rangeX = containerW - cardW;
  const rangeY = containerH - cardH;
  return {
    urgency: rangeX <= 0 ? 0 : clamp01(x / rangeX),
    importance: rangeY <= 0 ? 0 : clamp01(1 - y / rangeY),
  };
}
