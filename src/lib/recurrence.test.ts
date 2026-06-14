import { describe, expect, it } from "vitest";
import { initialNextDue, nextOnOrAfter, planGeneration } from "./recurrence";
import type { RecurringTemplate } from "../types/models";

function tpl(p: Partial<RecurringTemplate>): RecurringTemplate {
  return {
    id: "t",
    title: "繰り返し",
    memo: "",
    importance: 0.7,
    urgency: 0.3,
    freq: "daily",
    interval: 1,
    byweekday: [],
    bymonthday: null,
    anchorDate: "2026-06-01",
    nextDue: "2026-06-01",
    active: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    tagIds: [],
    ...p,
  };
}

describe("nextOnOrAfter — daily", () => {
  it("returns anchor when from is on/before anchor", () => {
    const t = tpl({ freq: "daily", interval: 1, anchorDate: "2026-06-01" });
    expect(nextOnOrAfter(t, "2026-05-20")).toBe("2026-06-01");
    expect(nextOnOrAfter(t, "2026-06-01")).toBe("2026-06-01");
  });
  it("steps by interval days", () => {
    const t = tpl({ freq: "daily", interval: 3, anchorDate: "2026-06-01" });
    expect(nextOnOrAfter(t, "2026-06-02")).toBe("2026-06-04");
    expect(nextOnOrAfter(t, "2026-06-04")).toBe("2026-06-04");
    expect(nextOnOrAfter(t, "2026-06-05")).toBe("2026-06-07");
  });
});

describe("nextOnOrAfter — weekly", () => {
  it("picks the next listed weekday (Mon/Wed/Fri)", () => {
    // 2026-06-01 は月曜
    const t = tpl({ freq: "weekly", interval: 1, byweekday: [1, 3, 5], anchorDate: "2026-06-01" });
    expect(nextOnOrAfter(t, "2026-06-01")).toBe("2026-06-01"); // Mon
    expect(nextOnOrAfter(t, "2026-06-02")).toBe("2026-06-03"); // Wed
    expect(nextOnOrAfter(t, "2026-06-04")).toBe("2026-06-05"); // Fri
    expect(nextOnOrAfter(t, "2026-06-06")).toBe("2026-06-08"); // 次週 Mon
  });
  it("honors interval (隔週)", () => {
    const t = tpl({ freq: "weekly", interval: 2, byweekday: [1], anchorDate: "2026-06-01" });
    expect(nextOnOrAfter(t, "2026-06-01")).toBe("2026-06-01");
    expect(nextOnOrAfter(t, "2026-06-02")).toBe("2026-06-15"); // 翌週はスキップ
  });
});

describe("nextOnOrAfter — monthly", () => {
  it("uses bymonthday each month", () => {
    const t = tpl({ freq: "monthly", interval: 1, bymonthday: 15, anchorDate: "2026-06-01" });
    expect(nextOnOrAfter(t, "2026-06-01")).toBe("2026-06-15");
    expect(nextOnOrAfter(t, "2026-06-16")).toBe("2026-07-15");
  });
  it("clamps day 31 to month end", () => {
    const t = tpl({ freq: "monthly", interval: 1, bymonthday: 31, anchorDate: "2026-01-31" });
    expect(nextOnOrAfter(t, "2026-02-01")).toBe("2026-02-28"); // 2月は末日へ
    expect(nextOnOrAfter(t, "2026-04-01")).toBe("2026-04-30");
  });
});

describe("nextOnOrAfter — yearly", () => {
  it("repeats the anchor month/day yearly", () => {
    const t = tpl({ freq: "yearly", interval: 1, anchorDate: "2026-04-01" });
    expect(nextOnOrAfter(t, "2026-04-02")).toBe("2027-04-01");
  });
});

describe("initialNextDue", () => {
  it("is the first occurrence on/after anchor", () => {
    const t = tpl({ freq: "weekly", interval: 1, byweekday: [3], anchorDate: "2026-06-01" });
    expect(initialNextDue(t)).toBe("2026-06-03"); // 最初の水曜
  });
});

describe("planGeneration — まとめて1件", () => {
  it("does not generate before due and keeps nextDue", () => {
    const t = tpl({ freq: "daily", interval: 1, nextDue: "2026-06-20" });
    const plan = planGeneration(t, "2026-06-10");
    expect(plan.due).toBe(false);
    expect(plan.dueDate).toBeNull();
    expect(plan.nextDue).toBe("2026-06-20");
  });
  it("collapses multiple missed occurrences into one (dueDate=直近)", () => {
    const t = tpl({ freq: "daily", interval: 1, nextDue: "2026-06-01" });
    const plan = planGeneration(t, "2026-06-05");
    expect(plan.due).toBe(true);
    expect(plan.dueDate).toBe("2026-06-05"); // 直近の発生日
    expect(plan.nextDue).toBe("2026-06-06"); // today より後の最初
  });
  it("generates exactly the due occurrence when only one passed", () => {
    const t = tpl({ freq: "weekly", interval: 1, byweekday: [1], nextDue: "2026-06-08" });
    const plan = planGeneration(t, "2026-06-09");
    expect(plan.due).toBe(true);
    expect(plan.dueDate).toBe("2026-06-08");
    expect(plan.nextDue).toBe("2026-06-15");
  });
});
