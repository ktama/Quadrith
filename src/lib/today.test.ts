import { describe, expect, it } from "vitest";
import { capacitySummary, carryOverToday, todayGroups } from "./today";
import { DEFAULT_EFFORT_MINUTES, type Task } from "../types/models";

const TODAY = "2026-06-28";

function task(p: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: "t",
    memo: "",
    importance: null,
    urgency: null,
    status: "todo",
    dueDate: null,
    reviewAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastProgressAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    deletedAt: null,
    templateId: null,
    category: null,
    effortSize: null,
    todayDate: null,
    todayOrder: null,
    tagIds: [],
    ...p,
  };
}

describe("todayGroups", () => {
  it("puts due/doing/review tasks into the auto group with badges", () => {
    const overdue = task({ id: "a", dueDate: "2026-06-20" });
    const dueToday = task({ id: "b", dueDate: TODAY });
    const doing = task({ id: "c", status: "doing" });
    const review = task({ id: "d", reviewAt: TODAY, status: "pending" });
    const g = todayGroups([review, doing, dueToday, overdue], TODAY, false);
    expect(g.auto.map((c) => c.task.id)).toEqual(["a", "b", "c", "d"]);
    expect(g.auto[0].badges).toContain("overdue");
    expect(g.auto[3].badges).toContain("review");
  });

  it("orders overdue tasks oldest-first", () => {
    const newer = task({ id: "n", dueDate: "2026-06-25" });
    const older = task({ id: "o", dueDate: "2026-06-10" });
    const g = todayGroups([newer, older], TODAY, false);
    expect(g.auto.map((c) => c.task.id)).toEqual(["o", "n"]);
  });

  it("includes Q1 only when includeUrgent is on", () => {
    const q1 = task({ id: "q", importance: 0.9, urgency: 0.9 });
    expect(todayGroups([q1], TODAY, false).auto).toHaveLength(0);
    const g = todayGroups([q1], TODAY, true);
    expect(g.auto[0].badges).toContain("urgent");
  });

  it("keeps a pick out of group B when it also qualifies for A, adding a pick badge", () => {
    const t = task({ id: "p", status: "doing", todayDate: TODAY });
    const g = todayGroups([t], TODAY, false);
    expect(g.picks).toHaveLength(0);
    expect(g.auto[0].badges).toEqual(expect.arrayContaining(["doing", "pick"]));
  });

  it("orders group B by todayOrder", () => {
    const a = task({ id: "a", todayDate: TODAY, todayOrder: 2 });
    const b = task({ id: "b", todayDate: TODAY, todayOrder: 0 });
    const c = task({ id: "c", todayDate: TODAY, todayOrder: 1 });
    const g = todayGroups([a, b, c], TODAY, false);
    expect(g.picks.map((x) => x.task.id)).toEqual(["b", "c", "a"]);
  });

  it("excludes done and deleted tasks", () => {
    const done = task({ id: "d", status: "done", dueDate: "2026-06-01" });
    const del = task({ id: "x", dueDate: "2026-06-01", deletedAt: "2026-06-02T00:00:00Z" });
    const g = todayGroups([done, del], TODAY, false);
    expect(g.auto).toHaveLength(0);
  });

  it("ignores a pick whose todayDate is not today (pre carry-over)", () => {
    const stale = task({ id: "s", todayDate: "2026-06-27" });
    const g = todayGroups([stale], TODAY, false);
    expect(g.picks).toHaveLength(0);
  });
});

describe("carryOverToday", () => {
  it("moves incomplete past picks to today", () => {
    const a = task({ id: "a", todayDate: "2026-06-27" });
    const b = task({ id: "b", todayDate: TODAY });
    const out = carryOverToday([a, b], TODAY);
    expect(out).toEqual([{ id: "a", todayDate: TODAY }]);
  });

  it("does not carry completed picks (keeps their date)", () => {
    const done = task({ id: "d", status: "done", todayDate: "2026-06-27" });
    expect(carryOverToday([done], TODAY)).toEqual([]);
  });
});

describe("capacitySummary", () => {
  it("sums estimated minutes and counts unestimated, flags overflow", () => {
    const groups = todayGroups(
      [
        task({ id: "a", status: "doing", effortSize: "L" }), // 180
        task({ id: "b", dueDate: TODAY, effortSize: "XL" }), // 480
        task({ id: "c", dueDate: TODAY, effortSize: null }), // 未見積り
      ],
      TODAY,
      false,
    );
    const cap = capacitySummary(groups, DEFAULT_EFFORT_MINUTES, 360);
    expect(cap.estimatedMinutes).toBe(660);
    expect(cap.unestimatedCount).toBe(1);
    expect(cap.remainingMinutes).toBe(360 - 660);
    expect(cap.over).toBe(true);
  });
});
