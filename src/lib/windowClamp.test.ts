import { describe, expect, it } from "vitest";
import { clampWindowToMonitors, type MonitorRect } from "./windowClamp";

const PRIMARY: MonitorRect = { x: 0, y: 0, width: 1920, height: 1080 };
const SECOND: MonitorRect = { x: 1920, y: 0, width: 1920, height: 1080 };

describe("clampWindowToMonitors", () => {
  it("keeps a window fully inside a monitor", () => {
    const w = { x: 100, y: 100, width: 1280, height: 800 };
    expect(clampWindowToMonitors(w, [PRIMARY])).toEqual(w);
  });

  it("keeps a window on a secondary monitor", () => {
    const w = { x: 2000, y: 100, width: 1280, height: 800 };
    expect(clampWindowToMonitors(w, [PRIMARY, SECOND])).toEqual(w);
  });

  it("recenters a window that is entirely off-screen", () => {
    const w = { x: 5000, y: 5000, width: 1280, height: 800 };
    const r = clampWindowToMonitors(w, [PRIMARY]);
    expect(r.x).toBe(Math.round((1920 - 1280) / 2));
    expect(r.y).toBe(Math.round((1080 - 800) / 2));
    expect(r.width).toBe(1280);
    expect(r.height).toBe(800);
  });

  it("recenters when only a sliver overlaps (less than the visible minimum)", () => {
    // 右に1pxだけ重なる → 不十分とみなして中央へ
    const w = { x: 1919, y: 100, width: 1280, height: 800 };
    const r = clampWindowToMonitors(w, [PRIMARY]);
    expect(r.x).toBe(Math.round((1920 - 1280) / 2));
  });

  it("shrinks a window larger than the monitor when recentering", () => {
    const w = { x: -9000, y: -9000, width: 4000, height: 3000 };
    const r = clampWindowToMonitors(w, [PRIMARY]);
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it("returns the window unchanged when no monitor info is available", () => {
    const w = { x: 99999, y: 99999, width: 100, height: 100 };
    expect(clampWindowToMonitors(w, [])).toEqual(w);
  });
});
