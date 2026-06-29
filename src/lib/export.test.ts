import { describe, expect, it } from "vitest";
import { buildCsv, buildJson, type ExportBundle } from "./export";
import type { RecurringTemplate, Tag, Task } from "../types/models";

const tags: Tag[] = [
  { id: "tag-1", name: "仕事", color: "#3b82f6" },
  { id: "tag-2", name: "家", color: "#22c55e" },
];

const templates: RecurringTemplate[] = [
  {
    id: "tpl-1",
    title: "ゴミ出し",
    memo: "",
    importance: 0.6,
    urgency: 0.4,
    freq: "weekly",
    interval: 1,
    byweekday: [1, 4],
    bymonthday: null,
    anchorDate: "2026-06-01",
    nextDue: "2026-06-15",
    active: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    category: null,
    effortSize: null,
    tagIds: ["tag-1"],
  },
];

function task(p: Partial<Task>): Task {
  return {
    id: "id-1",
    title: "タイトル",
    memo: "",
    importance: 0.8,
    urgency: 0.2,
    status: "todo",
    dueDate: "2026-06-20",
    reviewAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    lastProgressAt: "2026-01-02T00:00:00.000Z",
    completedAt: null,
    deletedAt: null,
    templateId: null,
    category: null,
    effortSize: null,
    todayDate: null,
    todayOrder: null,
    tagIds: ["tag-1", "tag-2"],
    ...p,
  };
}

describe("buildJson", () => {
  it("includes metadata, tasks, tags and templates and is valid JSON", () => {
    const bundle: ExportBundle = { tasks: [task({})], tags, templates };
    const parsed = JSON.parse(buildJson(bundle));
    expect(parsed.app).toBe("Quadrith");
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tags).toHaveLength(2);
    expect(parsed.templates).toHaveLength(1);
    expect(parsed.templates[0].id).toBe("tpl-1");
    expect(typeof parsed.exportedAt).toBe("string");
  });
});

describe("buildCsv", () => {
  it("writes a header row and one row per task", () => {
    const csv = buildCsv({ tasks: [task({}), task({ id: "id-2" })], tags, templates });
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3); // header + 2
    expect(lines[0]).toMatch(/^id,title,memo,/);
  });

  it("resolves tag ids to names joined by |", () => {
    const csv = buildCsv({ tasks: [task({})], tags, templates });
    expect(csv).toContain("仕事|家");
  });

  it("escapes commas, quotes and newlines", () => {
    const csv = buildCsv({
      tasks: [task({ title: 'a,b "c"', memo: "line1\nline2" })],
      tags,
      templates,
    });
    expect(csv).toContain('"a,b ""c"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders null coordinates as empty cells", () => {
    const csv = buildCsv({
      tasks: [task({ importance: null, urgency: null, tagIds: [] })],
      tags,
      templates,
    });
    const row = csv.split("\r\n")[1];
    // importance, urgency are the 4th and 5th columns
    expect(row).toContain("id-1,タイトル,,,,todo");
  });
});
