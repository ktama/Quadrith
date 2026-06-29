import { describe, expect, it } from "vitest";
import { effortToMinutes, sumEffortMinutes } from "./effort";
import { DEFAULT_EFFORT_MINUTES } from "../types/models";

describe("effortToMinutes", () => {
  it("maps sizes to default minutes", () => {
    expect(effortToMinutes("S", DEFAULT_EFFORT_MINUTES)).toBe(15);
    expect(effortToMinutes("M", DEFAULT_EFFORT_MINUTES)).toBe(60);
    expect(effortToMinutes("L", DEFAULT_EFFORT_MINUTES)).toBe(180);
    expect(effortToMinutes("XL", DEFAULT_EFFORT_MINUTES)).toBe(480);
  });

  it("returns null for unestimated", () => {
    expect(effortToMinutes(null, DEFAULT_EFFORT_MINUTES)).toBeNull();
  });

  it("follows a custom mapping", () => {
    const custom = { S: 10, M: 30, L: 120, XL: 300 };
    expect(effortToMinutes("M", custom)).toBe(30);
  });
});

describe("sumEffortMinutes", () => {
  it("sums estimated sizes and ignores nulls", () => {
    expect(sumEffortMinutes(["S", "M", null, "L"], DEFAULT_EFFORT_MINUTES)).toBe(15 + 60 + 180);
  });

  it("is zero for all unestimated or empty", () => {
    expect(sumEffortMinutes([], DEFAULT_EFFORT_MINUTES)).toBe(0);
    expect(sumEffortMinutes([null, null], DEFAULT_EFFORT_MINUTES)).toBe(0);
  });
});
