import { describe, expect, it } from "vitest";
import { dueBacklog, dueForWeeklyReview, inboxTasks, reviewBacklog, staleQ2 } from "./review";
import type { Task, WeeklyReviewSetting } from "../types/models";

const TODAY = "2026-06-24"; // 水曜(週: 月 2026-06-22 〜 日 2026-06-28)

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

describe("dueBacklog", () => {
  it("includes overdue and this-week due, oldest first; excludes later and done", () => {
    const out = dueBacklog(
      [
        task({ id: "overdue", dueDate: "2026-06-10" }),
        task({ id: "thisweek", dueDate: "2026-06-28" }),
        task({ id: "nextweek", dueDate: "2026-06-29" }),
        task({ id: "done", dueDate: "2026-06-10", status: "done" }),
      ],
      TODAY,
      "monday",
    );
    expect(out.map((t) => t.id)).toEqual(["overdue", "thisweek"]);
  });
});

describe("staleQ2", () => {
  it("returns Q2 tasks past the stale threshold", () => {
    const now = Date.parse("2026-06-24T00:00:00.000Z");
    const out = staleQ2(
      [
        task({ id: "old", importance: 0.9, urgency: 0.1, lastProgressAt: "2026-06-01T00:00:00.000Z" }), // 23日
        task({ id: "fresh", importance: 0.9, urgency: 0.1, lastProgressAt: "2026-06-20T00:00:00.000Z" }), // 4日
      ],
      now,
      14,
    );
    expect(out.map((t) => t.id)).toEqual(["old"]);
  });
});

describe("reviewBacklog", () => {
  it("returns pending/waiting with review due or unset", () => {
    const out = reviewBacklog(
      [
        task({ id: "a", status: "pending", reviewAt: "2026-06-20" }),
        task({ id: "b", status: "waiting", reviewAt: null }),
        task({ id: "c", status: "pending", reviewAt: "2026-07-01" }), // 未来 → 除外
        task({ id: "d", status: "todo", reviewAt: null }), // 状態違い → 除外
      ],
      TODAY,
    );
    expect(out.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });
});

describe("inboxTasks", () => {
  it("returns uncategorised incomplete tasks", () => {
    const out = inboxTasks([
      task({ id: "i" }),
      task({ id: "placed", importance: 0.5, urgency: 0.5 }),
      task({ id: "done", status: "done" }),
    ]);
    expect(out.map((t) => t.id)).toEqual(["i"]);
  });
});

describe("dueForWeeklyReview", () => {
  const setting: WeeklyReviewSetting = { enabled: true, weekday: 1, time: "09:00" }; // 月曜 9:00

  it("is false when disabled", () => {
    expect(dueForWeeklyReview({ ...setting, enabled: false }, TODAY, "12:00", null, "monday")).toBe(false);
  });

  it("is true once the configured weekday has passed and not yet reviewed this week", () => {
    expect(dueForWeeklyReview(setting, TODAY, "12:00", null, "monday")).toBe(true);
  });

  it("is false before the configured weekday", () => {
    // 金曜設定(weekday 5)の今週金曜は 2026-06-26 → 水曜 TODAY はまだ達していない
    expect(dueForWeeklyReview({ ...setting, weekday: 5 }, TODAY, "12:00", null, "monday")).toBe(false);
  });

  it("is false when already reviewed this week", () => {
    expect(dueForWeeklyReview(setting, TODAY, "12:00", "2026-06-23T09:00:00.000Z", "monday")).toBe(false);
  });

  it("is true again when last review was before this week", () => {
    expect(dueForWeeklyReview(setting, TODAY, "12:00", "2026-06-15T09:00:00.000Z", "monday")).toBe(true);
  });

  it("is false before the configured time on the target day itself", () => {
    // 設定曜日(月)に到達した当日でも、設定時刻(09:00)前なら出さない
    expect(dueForWeeklyReview(setting, "2026-06-22", "08:59", null, "monday")).toBe(false);
  });

  it("is true at or after the configured time on the target day", () => {
    expect(dueForWeeklyReview(setting, "2026-06-22", "09:00", null, "monday")).toBe(true);
  });
});
