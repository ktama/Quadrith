// 衝突回避レイアウト + クラスタリング(設計書 §4.3)
// 保存座標は変更せず、描画時のみ重なりを解消する。
// 1. カード中心間距離 < カード幅×0.5 のものを Union-Find でグループ化し、
//    グループサイズ >= 4 はクラスタ(「+N」バッジ1つ)に集約する
// 2. クラスタ化されなかったカードは id 昇順に確定配置し、重なる場合は
//    黄金角スパイラル上で最近傍の空き位置を探索する(決定的)

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

export interface Cluster {
  id: string; // 代表(最小)タスクid から決定的に生成
  x: number; // バッジ中心(px)
  y: number;
  taskIds: string[]; // id 昇順
}

export interface MatrixLayout {
  cards: PlacedCard[];
  clusters: Cluster[];
}

const GAP = 4; // カード間に確保する最小余白(px)
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // ≈ 2.39996 rad
const MAX_STEPS = 4000;
export const CLUSTER_MIN_SIZE = 4;
export const CLUSTER_BADGE_R = 18; // バッジ半径(px)

export function cardsOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
  cardW = CARD_W,
  cardH = CARD_H,
): boolean {
  return Math.abs(a.x - b.x) < cardW + GAP && Math.abs(a.y - b.y) < cardH + GAP;
}

export function computeMatrixLayout(
  items: LayoutItem[],
  containerW: number,
  containerH: number,
  cardW = CARD_W,
  cardH = CARD_H,
): MatrixLayout {
  const sorted = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const desired = sorted.map((item) =>
    normToPx(item.importance, item.urgency, containerW, containerH, cardW, cardH),
  );

  // --- クラスタ判定(Union-Find) ---
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const threshold = cardW * 0.5;
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const dx = desired[i].x - desired[j].x;
      const dy = desired[i].y - desired[j].y;
      if (Math.hypot(dx, dy) < threshold) {
        parent[find(j)] = find(i);
      }
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < sorted.length; i++) {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(i);
    else groups.set(root, [i]);
  }

  // --- クラスタ集約と単独カードの振り分け ---
  const clusters: Cluster[] = [];
  const singleIndexes: number[] = [];
  for (const member of groups.values()) {
    if (member.length >= CLUSTER_MIN_SIZE) {
      // バッジ位置 = メンバーのカード中心の重心(コンテナ内にクランプ)
      let cx = 0;
      let cy = 0;
      for (const i of member) {
        cx += desired[i].x + cardW / 2;
        cy += desired[i].y + cardH / 2;
      }
      cx /= member.length;
      cy /= member.length;
      clusters.push({
        id: `cluster-${sorted[member[0]].id}`,
        x: clamp(cx, CLUSTER_BADGE_R, Math.max(CLUSTER_BADGE_R, containerW - CLUSTER_BADGE_R)),
        y: clamp(cy, CLUSTER_BADGE_R, Math.max(CLUSTER_BADGE_R, containerH - CLUSTER_BADGE_R)),
        taskIds: member.map((i) => sorted[i].id),
      });
    } else {
      singleIndexes.push(...member);
    }
  }
  clusters.sort((a, b) => (a.id < b.id ? -1 : 1));
  singleIndexes.sort((a, b) => a - b); // = id 昇順(sorted のインデックス)

  // --- 単独カードの重なり解消 ---
  const maxX = Math.max(0, containerW - cardW);
  const maxY = Math.max(0, containerH - cardH);
  const placed: PlacedCard[] = [];
  for (const i of singleIndexes) {
    let pos = desired[i];
    if (placed.some((p) => cardsOverlap(pos, p, cardW, cardH))) {
      pos = findFreePosition(desired[i], placed, maxX, maxY, cardW, cardH);
    }
    placed.push({ id: sorted[i].id, x: pos.x, y: pos.y });
  }

  return { cards: placed, clusters };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
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
      x: clamp(desired.x + r * Math.cos(a), 0, maxX),
      y: clamp(desired.y + r * Math.sin(a), 0, maxY),
    };
    if (!placed.some((p) => cardsOverlap(candidate, p, cardW, cardH))) {
      return candidate;
    }
  }
  // 空きが見つからない極端な密集時は重なりを許容
  return desired;
}
