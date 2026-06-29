import { describe, expect, it } from "vitest";
import {
  completionStats,
  createdVsCompletedByWeek,
  oldestTodos,
  planAdherenceByWeek,
  q2LeadTimeMedianDays,
  q2StaleTop,
  quadrantBalanceByWeek,
  throughputByWeek,
  unestimatedRatio,
  weekStartOf,
} from "./stats";
import { DEFAULT_EFFORT_MINUTES, type Status, type Task } from "../types/models";

function done(importance: number, urgency: number, extra: Partial<Task> = {}): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: "t",
    memo: "",
    importance,
    urgency,
    status: "done" as Status,
    dueDate: null,
    reviewAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastProgressAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-06-01T00:00:00.000Z",
    deletedAt: null,
    templateId: null,
    category: null,
    effortSize: null,
    todayDate: null,
    todayOrder: null,
    tagIds: [],
    ...extra,
  };
}

describe("completionStats", () => {
  it("returns zeros for no completed tasks", () => {
    const s = completionStats([]);
    expect(s.total).toBe(0);
    expect(s.urgentRatio).toBe(0);
    expect(s.plannedRatio).toBe(0);
  });

  it("counts completed tasks per quadrant", () => {
    const s = completionStats([
      done(0.9, 0.9), // q1
      done(0.9, 0.1), // q2
      done(0.9, 0.1), // q2
      done(0.1, 0.9), // q3
      done(0.1, 0.1), // q4
    ]);
    expect(s.total).toBe(5);
    expect(s.byQuadrant).toEqual({ q1: 1, q2: 2, q3: 1, q4: 1 });
    expect(s.urgentRatio).toBeCloseTo(2 / 5, 10); // q1+q3
    expect(s.plannedRatio).toBeCloseTo(2 / 5, 10); // q2
  });

  it("excludes non-done, deleted, and inbox (no coordinate) tasks", () => {
    const s = completionStats([
      done(0.9, 0.9, { status: "doing" }),
      done(0.9, 0.9, { deletedAt: "2026-06-02T00:00:00.000Z" }),
      { ...done(0.9, 0.9), importance: null, urgency: null }, // 完了だが座標なし
      done(0.9, 0.9), // 唯一の有効な完了
    ]);
    expect(s.total).toBe(1);
    expect(s.byQuadrant.q1).toBe(1);
  });

  it("keeps stats in q1..q4 order with ratios summing to 1", () => {
    const s = completionStats([done(0.9, 0.9), done(0.1, 0.1)]);
    expect(s.stats.map((q) => q.quadrant)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(s.stats.reduce((acc, q) => acc + q.ratio, 0)).toBeCloseTo(1, 10);
  });
});

// 任意フィールドを差し込める汎用ファクトリ
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
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    lastProgressAt: "2026-06-01T00:00:00.000Z",
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

describe("weekStartOf", () => {
  it("rounds to Monday by default", () => {
    // 2026-06-28 は日曜 → その週の月曜は 2026-06-22
    expect(weekStartOf("2026-06-28", "monday")).toBe("2026-06-22");
    expect(weekStartOf("2026-06-22", "monday")).toBe("2026-06-22");
    expect(weekStartOf("2026-06-23", "monday")).toBe("2026-06-22");
  });

  it("rounds to Sunday when configured", () => {
    expect(weekStartOf("2026-06-28", "sunday")).toBe("2026-06-28");
    expect(weekStartOf("2026-06-27", "sunday")).toBe("2026-06-21");
  });

  it("accepts ISO timestamps (uses the date part)", () => {
    expect(weekStartOf("2026-06-24T15:00:00.000Z", "monday")).toBe("2026-06-22");
  });
});

describe("throughputByWeek", () => {
  it("counts completions and sums effort minutes per week", () => {
    const out = throughputByWeek(
      [
        task({ status: "done", completedAt: "2026-06-22T00:00:00.000Z", effortSize: "M" }), // 60
        task({ status: "done", completedAt: "2026-06-24T00:00:00.000Z", effortSize: "L" }), // 180
        task({ status: "done", completedAt: "2026-06-29T00:00:00.000Z", effortSize: null }), // 翌週
        task({ status: "todo" }), // 未完了は無視
      ],
      DEFAULT_EFFORT_MINUTES,
      "monday",
    );
    expect(out).toEqual([
      { week: "2026-06-22", count: 2, minutes: 240 },
      { week: "2026-06-29", count: 1, minutes: 0 },
    ]);
  });
});

describe("createdVsCompletedByWeek", () => {
  it("tracks created and completed counts with their difference", () => {
    const out = createdVsCompletedByWeek(
      [
        task({ createdAt: "2026-06-22T00:00:00.000Z" }),
        task({ createdAt: "2026-06-23T00:00:00.000Z", status: "done", completedAt: "2026-06-24T00:00:00.000Z" }),
      ],
      "monday",
    );
    expect(out).toEqual([{ week: "2026-06-22", created: 2, completed: 1, diff: 1 }]);
  });
});

describe("q2LeadTimeMedianDays", () => {
  it("returns the median completion lead time of done Q2 tasks", () => {
    const out = q2LeadTimeMedianDays([
      task({ importance: 0.9, urgency: 0.1, status: "done", createdAt: "2026-06-01T00:00:00.000Z", completedAt: "2026-06-03T00:00:00.000Z" }), // 2日
      task({ importance: 0.9, urgency: 0.1, status: "done", createdAt: "2026-06-01T00:00:00.000Z", completedAt: "2026-06-07T00:00:00.000Z" }), // 6日
      task({ importance: 0.9, urgency: 0.9, status: "done", createdAt: "2026-06-01T00:00:00.000Z", completedAt: "2026-06-20T00:00:00.000Z" }), // q1 → 除外
    ]);
    expect(out).toBe(4); // (2+6)/2
  });

  it("returns null when no done Q2 tasks", () => {
    expect(q2LeadTimeMedianDays([task({})])).toBeNull();
  });
});

describe("q2StaleTop", () => {
  it("ranks incomplete Q2 tasks by days since last progress", () => {
    const now = Date.parse("2026-06-28T00:00:00.000Z");
    const out = q2StaleTop(
      [
        task({ importance: 0.9, urgency: 0.1, lastProgressAt: "2026-06-01T00:00:00.000Z" }), // 27日
        task({ importance: 0.9, urgency: 0.1, lastProgressAt: "2026-06-20T00:00:00.000Z" }), // 8日
        task({ importance: 0.9, urgency: 0.9, lastProgressAt: "2026-01-01T00:00:00.000Z" }), // q1 → 除外
      ],
      now,
      5,
    );
    expect(out).toHaveLength(2);
    expect(out[0].days).toBe(27);
    expect(out[1].days).toBe(8);
  });
});

describe("oldestTodos", () => {
  it("returns todo tasks oldest-first up to the limit", () => {
    const out = oldestTodos(
      [
        task({ id: "b", createdAt: "2026-06-10T00:00:00.000Z" }),
        task({ id: "a", createdAt: "2026-06-01T00:00:00.000Z" }),
        task({ id: "x", status: "doing", createdAt: "2026-05-01T00:00:00.000Z" }), // doing → 除外
      ],
      5,
    );
    expect(out.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("quadrantBalanceByWeek", () => {
  it("computes per-week completion ratios per quadrant", () => {
    const out = quadrantBalanceByWeek(
      [
        task({ importance: 0.9, urgency: 0.9, status: "done", completedAt: "2026-06-22T00:00:00.000Z" }), // q1
        task({ importance: 0.9, urgency: 0.1, status: "done", completedAt: "2026-06-23T00:00:00.000Z" }), // q2
      ],
      "monday",
    );
    expect(out[0].week).toBe("2026-06-22");
    expect(out[0].ratio.q1).toBeCloseTo(0.5, 10);
    expect(out[0].ratio.q2).toBeCloseTo(0.5, 10);
  });
});

describe("planAdherenceByWeek", () => {
  it("measures completion on the planned (today_date) day", () => {
    const out = planAdherenceByWeek(
      [
        task({ todayDate: "2026-06-22", status: "done", completedAt: "2026-06-22T10:00:00.000Z" }), // 遵守
        task({ todayDate: "2026-06-23", status: "done", completedAt: "2026-06-24T10:00:00.000Z" }), // 翌日完了 → 未遵守
        task({ todayDate: "2026-06-24", status: "todo" }), // 未完了 → 未遵守
      ],
      "monday",
    );
    expect(out).toEqual([{ week: "2026-06-22", planned: 3, completed: 1, ratio: 1 / 3 }]);
  });
});

describe("unestimatedRatio", () => {
  it("computes the share of active tasks without an effort size", () => {
    const out = unestimatedRatio([
      task({ effortSize: null }),
      task({ effortSize: "M" }),
      task({ effortSize: null, status: "done" }), // 完了は除外
      task({ effortSize: null, deletedAt: "2026-06-02T00:00:00.000Z" }), // 削除は除外
    ]);
    expect(out).toEqual({ total: 2, unestimated: 1, ratio: 0.5 });
  });
});
