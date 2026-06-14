import { describe, expect, it } from "vitest";
import { buildCsv, buildJson, type ExportBundle } from "./export";
import type { Tag, Task } from "../types/models";

const tags: Tag[] = [
  { id: "tag-1", name: "仕事", color: "#3b82f6" },
  { id: "tag-2", name: "家", color: "#22c55e" },
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
    tagIds: ["tag-1", "tag-2"],
    ...p,
  };
}

describe("buildJson", () => {
  it("includes metadata, tasks and tags and is valid JSON", () => {
    const bundle: ExportBundle = { tasks: [task({})], tags };
    const parsed = JSON.parse(buildJson(bundle));
    expect(parsed.app).toBe("Quadrith");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tags).toHaveLength(2);
    expect(typeof parsed.exportedAt).toBe("string");
  });
});

describe("buildCsv", () => {
  it("writes a header row and one row per task", () => {
    const csv = buildCsv({ tasks: [task({}), task({ id: "id-2" })], tags });
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3); // header + 2
    expect(lines[0]).toMatch(/^id,title,memo,/);
  });

  it("resolves tag ids to names joined by |", () => {
    const csv = buildCsv({ tasks: [task({})], tags });
    expect(csv).toContain("仕事|家");
  });

  it("escapes commas, quotes and newlines", () => {
    const csv = buildCsv({
      tasks: [task({ title: 'a,b "c"', memo: "line1\nline2" })],
      tags,
    });
    expect(csv).toContain('"a,b ""c"""');
    expect(csv).toContain('"line1\nline2"');
  });

  it("renders null coordinates as empty cells", () => {
    const csv = buildCsv({ tasks: [task({ importance: null, urgency: null, tagIds: [] })], tags });
    const row = csv.split("\r\n")[1];
    // importance, urgency are the 4th and 5th columns
    expect(row).toContain("id-1,タイトル,,,,todo");
  });
});
