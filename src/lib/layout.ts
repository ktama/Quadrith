// 衝突回避レイアウト(設計書 §4.3)
// 保存座標は変更せず、描画時のみ重なりを解消する。
// 決定性を保証するため id 昇順に確定配置し、重なる場合は黄金角スパイラル上で
// 最近傍の空き位置を探索する。
// ※ クラスタリング(「+N」表示)はフェーズ2で追加予定。

import { CARD_W, CARD_H, normToPx } from "./coords";

export interface LayoutItem {
  id: string;
  importance: number;
  urgency: number;
}

export interface PlacedCard {
  id: string;
  x: number;
  y: number;
}

const GAP = 4; // カード間に確保する最小余白(px)
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996 rad
const MAX_STEPS = 4000;

export function cardsOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cardW = CARD_W,
  cardH = CARD_H,
): boolean {
  return Math.abs(a.x - b.x) < cardW + GAP && Math.abs(a.y - b.y) < cardH + GAP;
}

export function layoutCards(
  items: LayoutItem[],
  containerW: number,
  containerH: number,
  cardW = CARD_W,
  cardH = CARD_H,
): PlacedCard[] {
  const maxX = Math.max(0, containerW - cardW);
  const maxY = Math.max(0, containerH - cardH);
  const sorted = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: PlacedCard[] = [];

  for (const item of sorted) {
    const desired = normToPx(item.importance, item.urgency, containerW, containerH, cardW, cardH);
    let pos = desired;
    if (placed.some((p) => cardsOverlap(desired, p, cardW, cardH))) {
      pos = findFreePosition(desired, placed, maxX, maxY, cardW, cardH);
    }
    placed.push({ id: item.id, x: pos.x, y: pos.y });
  }
  return placed;
}

function findFreePosition(
  desired: { x: number; y: number },
  placed: PlacedCard[],
  maxX: number,
  maxY: number,
  cardW: number,
  cardH: number,
): { x: number; y: number } {
  for (let k = 1; k <= MAX_STEPS; k++) {
    const r = 9 * Math.sqrt(k);
    const a = k * GOLDEN_ANGLE;
    const candidate = {
      x: Math.min(maxX, Math.max(0, desired.x + r * Math.cos(a))),
      y: Math.min(maxY, Math.max(0, desired.y + r * Math.sin(a))),
    };
    if (!placed.some((p) => cardsOverlap(candidate, p, cardW, cardH))) {
      return candidate;
    }
  }
  // 空きが見つからない極端な密集時は重なりを許容(フェーズ2のクラスタ表示で解消予定)
  return desired;
}
