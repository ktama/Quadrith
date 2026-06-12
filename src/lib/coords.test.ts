import { describe, expect, it } from "vitest";
import { clamp01, normToPx, pxToNorm } from "./coords";

const W = 1000;
const H = 700;
const CW = 144;
const CH = 60;

describe("clamp01", () => {
  it("clamps out-of-range values", () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.42)).toBe(0.42);
  });
});

describe("normToPx", () => {
  it("maps importance=1, urgency=1 to top-right", () => {
    expect(normToPx(1, 1, W, H, CW, CH)).toEqual({ x: W - CW, y: 0 });
  });

  it("maps importance=0, urgency=0 to bottom-left", () => {
    expect(normToPx(0, 0, W, H, CW, CH)).toEqual({ x: 0, y: H - CH });
  });

  it("maps center to center", () => {
    expect(normToPx(0.5, 0.5, W, H, CW, CH)).toEqual({ x: (W - CW) / 2, y: (H - CH) / 2 });
  });

  it("does not produce NaN for degenerate containers", () => {
    const p = normToPx(0.5, 0.5, 100, 40, CW, CH); // コンテナ < カード
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
  });
});

describe("pxToNorm", () => {
  it("roundtrips with normToPx", () => {
    for (const [imp, urg] of [
      [0, 0],
      [1, 1],
      [0.25, 0.75],
      [0.5, 0.5],
    ] as const) {
      const { x, y } = normToPx(imp, urg, W, H, CW, CH);
      const back = pxToNorm(x, y, W, H, CW, CH);
      expect(back.importance).toBeCloseTo(imp, 10);
      expect(back.urgency).toBeCloseTo(urg, 10);
    }
  });

  it("clamps drops outside the container", () => {
    const over = pxToNorm(99999, -99999, W, H, CW, CH);
    expect(over.urgency).toBe(1);
    expect(over.importance).toBe(1);
  });

  it("does not produce NaN for degenerate containers", () => {
    const n = pxToNorm(10, 10, 100, 40, CW, CH);
    expect(Number.isNaN(n.importance)).toBe(false);
    expect(Number.isNaN(n.urgency)).toBe(false);
  });
});
