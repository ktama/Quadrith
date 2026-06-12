import { describe, expect, it } from "vitest";
import { cardsOverlap, layoutCards, type LayoutItem } from "./layout";

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

describe("layoutCards", () => {
  it("keeps a single card at its exact desired position", () => {
    const [placed] = layoutCards([{ id: "a", importance: 1, urgency: 1 }], W, H, CW, CH);
    expect(placed).toEqual({ id: "a", x: W - CW, y: 0 });
  });

  it("does not mutate input", () => {
    const items = makeStack(3);
    const snapshot = JSON.parse(JSON.stringify(items));
    layoutCards(items, W, H, CW, CH);
    expect(items).toEqual(snapshot);
  });

  it("resolves overlaps for stacked cards", () => {
    const placed = layoutCards(makeStack(10), W, H, CW, CH);
    expect(placed).toHaveLength(10);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(
          cardsOverlap(placed[i], placed[j], CW, CH),
          `${placed[i].id} overlaps ${placed[j].id}`,
        ).toBe(false);
      }
    }
  });

  it("keeps all cards inside the container", () => {
    const placed = layoutCards(makeStack(15, 0.95, 0.95), W, H, CW, CH);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W - CW);
      expect(p.y).toBeLessThanOrEqual(H - CH);
    }
  });

  it("is deterministic regardless of input order", () => {
    const items = makeStack(8);
    const shuffled = [items[3], items[7], items[0], items[5], items[1], items[6], items[2], items[4]];
    const a = layoutCards(items, W, H, CW, CH);
    const b = layoutCards(shuffled, W, H, CW, CH);
    expect(a).toEqual(b);
  });
});
