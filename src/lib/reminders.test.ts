import { describe, expect, it } from "vitest";
import { computeReminders, notifiableReminders } from "./reminders";
import type { Status, Task } from "../types/models";

const TODAY = "2026-06-13";
const NOW = Date.parse(`${TODAY}T09:00:00.000Z`);
const DAY = 86_400_000;

function task(p: Partial<Task>): Task {
  return {
    id: Math.random().toString(36).slice(2),
    title: "t",
    memo: "",
    importance: null,
    urgency: null,
    status: "todo" as Status,
    dueDate: null,
    reviewAt: null,
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    completedAt: null,
    deletedAt: null,
    tagIds: [],
    ...p,
  };
}

describe("computeReminders", () => {
  it("flags due today and overdue", () => {
    const items = computeReminders(
      [task({ dueDate: TODAY }), task({ dueDate: "2026-06-10" })],
      TODAY,
      NOW,
    );
    expect(items.map((i) => i.kind)).toEqual(["due", "due"]);
    expect(items[0].detail).toBe("今日が期限");
    expect(items[1].detail).toContain("期限超過");
  });

  it("does not flag future due dates", () => {
    expect(computeReminders([task({ dueDate: "2026-06-20" })], TODAY, NOW)).toHaveLength(0);
  });

  it("flags review only for pending/waiting", () => {
    const items = computeReminders(
      [
        task({ reviewAt: TODAY, status: "pending" }),
        task({ reviewAt: TODAY, status: "waiting" }),
        task({ reviewAt: TODAY, status: "todo" }), // 対象外
      ],
      TODAY,
      NOW,
    );
    expect(items.filter((i) => i.kind === "review")).toHaveLength(2);
  });

  it("flags stale Q2 tasks after the threshold", () => {
    const stale = task({
      importance: 0.9,
      urgency: 0.1, // Q2
      updatedAt: new Date(NOW - 20 * DAY).toISOString(),
    });
    const fresh = task({
      importance: 0.9,
      urgency: 0.1,
      updatedAt: new Date(NOW - 3 * DAY).toISOString(),
    });
    const items = computeReminders([stale, fresh], TODAY, NOW);
    expect(items.filter((i) => i.kind === "stale")).toHaveLength(1);
  });

  it("does not flag stale for non-Q2 quadrants", () => {
    const q1 = task({
      importance: 0.9,
      urgency: 0.9, // Q1
      updatedAt: new Date(NOW - 40 * DAY).toISOString(),
    });
    expect(computeReminders([q1], TODAY, NOW).filter((i) => i.kind === "stale")).toHaveLength(0);
  });

  it("ignores done and deleted tasks", () => {
    const items = computeReminders(
      [
        task({ dueDate: TODAY, status: "done" }),
        task({ dueDate: TODAY, deletedAt: new Date(NOW).toISOString() }),
      ],
      TODAY,
      NOW,
    );
    expect(items).toHaveLength(0);
  });
});

describe("notifiableReminders", () => {
  it("keeps due/review but drops stale", () => {
    const items = computeReminders(
      [
        task({ dueDate: TODAY }),
        task({ reviewAt: TODAY, status: "pending" }),
        task({ importance: 0.9, urgency: 0.1, updatedAt: new Date(NOW - 30 * DAY).toISOString() }),
      ],
      TODAY,
      NOW,
    );
    const kinds = notifiableReminders(items).map((i) => i.kind);
    expect(kinds).toContain("due");
    expect(kinds).toContain("review");
    expect(kinds).not.toContain("stale");
  });
});
