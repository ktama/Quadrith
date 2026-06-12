import { describe, expect, it } from "vitest";
import { cardsOverlap, computeMatrixLayout, type LayoutItem } from "./layout";

const W = 1000;
const H = 700;
const CW = 144;
const CH = 60;

function makeStack(n: number, importance = 0.5, urgency = 0.5): LayoutItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `task-${String(i).padStart(3, "0")}`,
    importance,
    urgency,
  }));
}

describe("computeMatrixLayout", () => {
  it("keeps a single card at its exact desired position", () => {
    const { cards, clusters } = computeMatrixLayout(
      [{ id: "a", importance: 1, urgency: 1 }],
      W,
      H,
      CW,
      CH,
    );
    expect(cards).toEqual([{ id: "a", x: W - CW, y: 0 }]);
    expect(clusters).toEqual([]);
  });

  it("does not mutate input", () => {
    const items = makeStack(5);
    const snapshot = JSON.parse(JSON.stringify(items));
    computeMatrixLayout(items, W, H, CW, CH);
    expect(items).toEqual(snapshot);
  });

  it("resolves overlaps for 3 stacked cards without clustering", () => {
    const { cards, clusters } = computeMatrixLayout(makeStack(3), W, H, CW, CH);
    expect(clusters).toEqual([]);
    expect(cards).toHaveLength(3);
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        expect(
          cardsOverlap(cards[i], cards[j], CW, CH),
          `${cards[i].id} overlaps ${cards[j].id}`,
        ).toBe(false);
      }
    }
  });

  it("collapses 4+ stacked cards into one cluster badge", () => {
    const { cards, clusters } = computeMatrixLayout(makeStack(10), W, H, CW, CH);
    expect(cards).toEqual([]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].taskIds).toHaveLength(10);
    expect(clusters[0].taskIds).toEqual([...clusters[0].taskIds].sort());
    // バッジは積み重ね位置(中心)に出る
    expect(clusters[0].x).toBeCloseTo((W - CW) / 2 + CW / 2, 5);
    expect(clusters[0].y).toBeCloseTo((H - CH) / 2 + CH / 2, 5);
  });

  it("handles a mix of clusters and single cards", () => {
    const items = [
      ...makeStack(4, 0.5, 0.5), // クラスタ
      { id: "x-solo-1", importance: 0.1, urgency: 0.1 },
      { id: "x-solo-2", importance: 0.9, urgency: 0.9 },
    ];
    const { cards, clusters } = computeMatrixLayout(items, W, H, CW, CH);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].taskIds).toHaveLength(4);
    expect(cards.map((c) => c.id).sort()).toEqual(["x-solo-1", "x-solo-2"]);
  });

  it("keeps single cards inside the container", () => {
    // 距離は離れているが境界付近で重なる配置
    const items: LayoutItem[] = [
      { id: "a", importance: 0.98, urgency: 0.98 },
      { id: "b", importance: 0.9, urgency: 0.9 },
      { id: "c", importance: 0.82, urgency: 0.82 },
    ];
    const { cards } = computeMatrixLayout(items, W, H, CW, CH);
    for (const p of cards) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W - CW);
      expect(p.y).toBeLessThanOrEqual(H - CH);
    }
  });

  it("is deterministic regardless of input order", () => {
    const items = [...makeStack(6), { id: "z-solo", importance: 0.2, urgency: 0.8 }];
    const shuffled = [items[4], items[6], items[0], items[5], items[2], items[1], items[3]];
    const a = computeMatrixLayout(items, W, H, CW, CH);
    const b = computeMatrixLayout(shuffled, W, H, CW, CH);
    expect(a).toEqual(b);
  });
});
