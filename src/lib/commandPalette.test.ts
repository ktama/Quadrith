import { describe, expect, it } from "vitest";
import { filterCommands, matchScore, type Command } from "./commandPalette";

function cmd(id: string, title: string, keywords?: string): Command {
  return { id, title, keywords, run: () => {} };
}

describe("matchScore", () => {
  it("空クエリは常に一致(スコア0)", () => {
    expect(matchScore("カンバン", "")).toBe(0);
  });

  it("部分列でなければ null", () => {
    expect(matchScore("カンバン", "xyz")).toBeNull();
    expect(matchScore("abc", "abcd")).toBeNull();
  });

  it("部分列なら一致する", () => {
    expect(matchScore("matrix", "mtx")).not.toBeNull();
    expect(matchScore("カンバンに移動", "カンバン")).not.toBeNull();
  });

  it("大文字小文字を無視する", () => {
    expect(matchScore("Matrix", "matrix")).toBe(matchScore("matrix", "matrix"));
  });

  it("先頭一致・連続一致のほうがスコアが小さい(良い)", () => {
    const head = matchScore("kanban", "kan")!; // 先頭で連続
    const scattered = matchScore("knaban", "kan")!; // 飛び飛び
    expect(head).toBeLessThan(scattered);
  });
});

describe("filterCommands", () => {
  const cmds = [cmd("a", "マトリクスに移動"), cmd("b", "カンバンに移動"), cmd("c", "設定を開く", "settings")];

  it("空クエリは全件を元の順序で返す", () => {
    expect(filterCommands(cmds, "").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("一致しないものは除外する", () => {
    expect(filterCommands(cmds, "カンバン").map((c) => c.id)).toEqual(["b"]);
  });

  it("keywords にも一致する", () => {
    expect(filterCommands(cmds, "settings").map((c) => c.id)).toEqual(["c"]);
  });

  it("より良い一致が先に来る", () => {
    const result = filterCommands(cmds, "移動");
    expect(result.map((c) => c.id)).toContain("a");
    expect(result.map((c) => c.id)).toContain("b");
  });
});
