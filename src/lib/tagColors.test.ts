import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAG_COLOR,
  perceivedBrightness,
  readableTextColor,
  TAG_PALETTE,
} from "./tagColors";

describe("TAG_PALETTE", () => {
  it("色が重複していない", () => {
    const lower = TAG_PALETTE.map((c) => c.toLowerCase());
    expect(new Set(lower).size).toBe(TAG_PALETTE.length);
  });

  it("全色が #rrggbb 形式", () => {
    for (const c of TAG_PALETTE) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("既定色はパレット先頭", () => {
    expect(DEFAULT_TAG_COLOR).toBe(TAG_PALETTE[0]);
  });
});

describe("readableTextColor", () => {
  it("暗い背景には白文字", () => {
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#3b82f6")).toBe("#ffffff"); // 青
    expect(readableTextColor("#ef4444")).toBe("#ffffff"); // 赤
  });

  it("明るい背景には黒文字", () => {
    expect(readableTextColor("#ffffff")).toBe("#000000");
    expect(readableTextColor("#eab308")).toBe("#000000"); // 黄
    expect(readableTextColor("#84cc16")).toBe("#000000"); // ライム
  });

  it("短縮形 #rgb も解釈する", () => {
    expect(readableTextColor("#fff")).toBe("#000000");
    expect(readableTextColor("#000")).toBe("#ffffff");
  });

  it("不正値は黒背景扱いで白文字", () => {
    expect(readableTextColor("not-a-color")).toBe("#ffffff");
  });
});

describe("perceivedBrightness", () => {
  it("白は 1、黒は 0", () => {
    expect(perceivedBrightness("#ffffff")).toBeCloseTo(1, 5);
    expect(perceivedBrightness("#000000")).toBeCloseTo(0, 5);
  });
});
