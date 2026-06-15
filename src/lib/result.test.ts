import { describe, expect, it } from "vitest";
import { err, ok, partitionByResult, type Result } from "./result";

describe("partitionByResult", () => {
  const items = ["a", "b", "c"];

  it("全成功なら ok に全件、failed は空", () => {
    const results: Result<unknown>[] = [ok(1), ok(2), ok(3)];
    expect(partitionByResult(items, results)).toEqual({ ok: ["a", "b", "c"], failed: [] });
  });

  it("全失敗なら failed に全件、ok は空", () => {
    const results: Result<unknown>[] = [
      err("DB_WRITE", "x"),
      err("DB_WRITE", "y"),
      err("DB_WRITE", "z"),
    ];
    expect(partitionByResult(items, results)).toEqual({ ok: [], failed: ["a", "b", "c"] });
  });

  it("部分失敗を index 対応で振り分ける", () => {
    const results: Result<unknown>[] = [ok(1), err("DB_WRITE", "y"), ok(3)];
    expect(partitionByResult(items, results)).toEqual({ ok: ["a", "c"], failed: ["b"] });
  });

  it("results が不足している分は failed 扱い", () => {
    const results: Result<unknown>[] = [ok(1)];
    expect(partitionByResult(items, results)).toEqual({ ok: ["a"], failed: ["b", "c"] });
  });

  it("空配列は両方空", () => {
    expect(partitionByResult([], [])).toEqual({ ok: [], failed: [] });
  });
});
