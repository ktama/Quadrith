import { describe, expect, it } from "vitest";
import { toggleSelected } from "./selection";

describe("toggleSelected", () => {
  it("未選択の id を追加する", () => {
    expect(toggleSelected(["a"], "b")).toEqual(["a", "b"]);
  });

  it("選択済みの id を外す", () => {
    expect(toggleSelected(["a", "b"], "a")).toEqual(["b"]);
  });

  it("空集合への追加", () => {
    expect(toggleSelected([], "a")).toEqual(["a"]);
  });

  it("元の配列を破壊しない", () => {
    const ids = ["a"];
    toggleSelected(ids, "b");
    expect(ids).toEqual(["a"]);
  });
});
