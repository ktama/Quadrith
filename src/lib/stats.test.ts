import { describe, expect, it } from "vitest";
import { completionStats } from "./stats";
import type { Status, Task } from "../types/models";

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
