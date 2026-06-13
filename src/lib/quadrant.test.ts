import { describe, expect, it } from "vitest";
import { quadrantOf, taskQuadrant } from "./quadrant";
import type { Task } from "../types/models";

function task(p: Partial<Task>): Task {
  return {
    id: "x",
    title: "t",
    memo: "",
    importance: null,
    urgency: null,
    status: "todo",
    dueDate: null,
    reviewAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: null,
    deletedAt: null,
    tagIds: [],
    ...p,
  };
}

describe("quadrantOf", () => {
  it("classifies the four quadrants", () => {
    expect(quadrantOf(0.9, 0.9)).toBe("q1"); // 重要×緊急
    expect(quadrantOf(0.9, 0.1)).toBe("q2"); // 重要×非緊急
    expect(quadrantOf(0.1, 0.9)).toBe("q3"); // 非重要×緊急
    expect(quadrantOf(0.1, 0.1)).toBe("q4"); // 非重要×非緊急
  });

  it("treats exactly 0.5 as the high side (>= 0.5)", () => {
    expect(quadrantOf(0.5, 0.5)).toBe("q1");
    expect(quadrantOf(0.5, 0.49)).toBe("q2");
    expect(quadrantOf(0.49, 0.5)).toBe("q3");
    expect(quadrantOf(0.49, 0.49)).toBe("q4");
  });
});

describe("taskQuadrant", () => {
  it("returns null for inbox (no coordinates)", () => {
    expect(taskQuadrant(task({ importance: null, urgency: null }))).toBeNull();
  });

  it("returns the quadrant for placed tasks", () => {
    expect(taskQuadrant(task({ importance: 0.8, urgency: 0.2 }))).toBe("q2");
  });
});
