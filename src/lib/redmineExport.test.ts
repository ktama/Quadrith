import { describe, expect, it } from "vitest";
import {
  buildRedmineCsv,
  defaultRedmineConfig,
  type RedmineRow,
  selectRedmineRows,
} from "./redmineExport";
import type { RecurringTemplate, Tag, Task } from "../types/models";

const tags: Tag[] = [
  { id: "tag-1", name: "仕事", color: "#3b82f6" },
  { id: "tag-2", name: "家", color: "#22c55e" },
];

function task(p: Partial<Task>): Task {
  return {
    id: "id-1",
    title: "タイトル",
    memo: "",
    importance: 0.8, // 重要
    urgency: 0.8, // 緊急 → q1
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
    tagIds: [],
    ...p,
  };
}

function template(p: Partial<RecurringTemplate>): RecurringTemplate {
  return {
    id: "tpl-1",
    title: "ゴミ出し",
    memo: "",
    importance: 0.6, // 重要
    urgency: 0.2, // 非緊急 → q2
    freq: "weekly",
    interval: 1,
    byweekday: [1], // 月曜
    bymonthday: null,
    anchorDate: "2026-06-01",
    nextDue: "2026-06-01",
    active: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    category: null,
    effortSize: null,
    tagIds: [],
    ...p,
  };
}

const PERIOD = { from: "2026-06-01", to: "2026-06-30" };

describe("selectRedmineRows: 通常タスク", () => {
  it("期日が期間内の未完了タスクを出力する", () => {
    const rows = selectRedmineRows([task({ dueDate: "2026-06-20" })], [], PERIOD);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("タイトル");
  });

  it("期間の両端を含む", () => {
    const rows = selectRedmineRows(
      [
        task({ id: "a", dueDate: "2026-06-01" }),
        task({ id: "b", dueDate: "2026-06-30" }),
        task({ id: "c", dueDate: "2026-05-31" }), // 期間外
        task({ id: "d", dueDate: "2026-07-01" }), // 期間外
      ],
      [],
      PERIOD,
    );
    expect(rows).toHaveLength(2);
  });

  it("期日なし・完了・論理削除は除外する", () => {
    const rows = selectRedmineRows(
      [
        task({ id: "a", dueDate: null }),
        task({ id: "b", status: "done", dueDate: "2026-06-10" }),
        task({ id: "c", deletedAt: "2026-06-05T00:00:00.000Z", dueDate: "2026-06-10" }),
      ],
      [],
      PERIOD,
    );
    expect(rows).toHaveLength(0);
  });
});

describe("selectRedmineRows: 繰り返し展開", () => {
  it("期間内の発生日ごとに1行展開する(毎週月曜・6月は5回)", () => {
    const rows = selectRedmineRows([], [template({})], PERIOD);
    // 2026-06 の月曜: 1, 8, 15, 22, 29 の5回
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.dueDate)).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
    ]);
    expect(rows[0].status).toBe("todo"); // 展開行は新規
  });

  it("停止中のひな型は展開しない", () => {
    const rows = selectRedmineRows([], [template({ active: false })], PERIOD);
    expect(rows).toHaveLength(0);
  });

  it("実体がある発生日はスキップし二重計上しない(実体優先)", () => {
    // 6/8 はユーザーが編集した実体として既に存在
    const instance = task({
      id: "inst",
      title: "ゴミ出し(編集済み)",
      templateId: "tpl-1",
      dueDate: "2026-06-08",
      importance: 0.6,
      urgency: 0.2,
    });
    const rows = selectRedmineRows([instance], [template({})], PERIOD);
    expect(rows).toHaveLength(5); // 重複なし
    const due8 = rows.filter((r) => r.dueDate === "2026-06-08");
    expect(due8).toHaveLength(1);
    expect(due8[0].title).toBe("ゴミ出し(編集済み)"); // 実体の編集が残る
  });

  it("毎日の繰り返しも期間内を全展開する", () => {
    const rows = selectRedmineRows(
      [],
      [template({ freq: "daily", interval: 1, byweekday: [] })],
      { from: "2026-06-01", to: "2026-06-05" },
    );
    expect(rows).toHaveLength(5);
  });
});

describe("buildRedmineCsv", () => {
  // 既定では開始日・カテゴリ列も出るが、基本のマッピング検証では無効化して列位置を固定する
  const config = { ...defaultRedmineConfig("作業"), includeStartDate: false, includeCategory: false };

  function row(p: Partial<RedmineRow>): RedmineRow {
    return {
      title: "件名",
      memo: "",
      status: "todo",
      priorityKey: "q1",
      dueDate: "2026-06-20",
      startDate: "2026-06-01",
      category: null,
      tagIds: [],
      ...p,
    };
  }

  it("日本語ヘッダーと行を出力する", () => {
    const csv = buildRedmineCsv([row({})], tags, config);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("題名,説明,トラッカー,ステータス,優先度,期日");
    expect(lines).toHaveLength(2);
  });

  it("ステータス・優先度・トラッカーをマッピングする", () => {
    const csv = buildRedmineCsv(
      [row({ status: "doing", priorityKey: "q2" })],
      tags,
      config,
    );
    const cells = csv.split("\r\n")[1].split(",");
    expect(cells[2]).toBe("作業"); // トラッカー
    expect(cells[3]).toBe("進行中"); // doing
    expect(cells[4]).toBe("高め"); // q2
  });

  it("forceNewStatus で全行を新規(todo の対応値)で出力する", () => {
    const forced = { ...defaultRedmineConfig("作業"), forceNewStatus: true };
    const csv = buildRedmineCsv(
      [row({ status: "doing" }), row({ status: "pending" })],
      tags,
      forced,
    );
    const lines = csv.split("\r\n");
    expect(lines[1].split(",")[3]).toBe("新規");
    expect(lines[2].split(",")[3]).toBe("新規");
  });

  it("インボックス(座標なし)は優先度=通常", () => {
    const csv = buildRedmineCsv([row({ priorityKey: "inbox" })], tags, config);
    expect(csv.split("\r\n")[1].split(",")[4]).toBe("通常");
  });

  it("タグを説明に補記する(memo あり)", () => {
    const csv = buildRedmineCsv([row({ memo: "本文", tagIds: ["tag-1", "tag-2"] })], tags, config);
    expect(csv).toContain('"本文');
    expect(csv).toContain("タグ: 仕事, 家");
  });

  it("memo が空ならタグ補記のみ", () => {
    const csv = buildRedmineCsv([row({ memo: "", tagIds: ["tag-1"] })], tags, config);
    const desc = csv.split("\r\n")[1].split(",")[1];
    expect(desc).toBe("タグ: 仕事");
  });

  it("タグなしなら説明は memo のみ", () => {
    const csv = buildRedmineCsv([row({ memo: "ただの本文", tagIds: [] })], tags, config);
    expect(csv.split("\r\n")[1].split(",")[1]).toBe("ただの本文");
  });

  it("カンマ・引用符・改行をエスケープする", () => {
    const csv = buildRedmineCsv([row({ title: 'a,b "c"' })], tags, config);
    expect(csv).toContain('"a,b ""c"""');
  });

  it("期日 null は空セル", () => {
    const csv = buildRedmineCsv([row({ dueDate: null, priorityKey: "q1" })], tags, config);
    const cells = csv.split("\r\n")[1].split(",");
    expect(cells[5]).toBe("");
  });

  it("includeStartDate / includeCategory で列を出し分ける", () => {
    const full = { ...defaultRedmineConfig("作業"), includeStartDate: true, includeCategory: true };
    const csv = buildRedmineCsv(
      [row({ startDate: "2026-06-01", category: "案件A" })],
      tags,
      full,
    );
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("題名,説明,トラッカー,ステータス,優先度,期日,開始日,カテゴリ");
    const cells = lines[1].split(",");
    expect(cells[6]).toBe("2026-06-01");
    expect(cells[7]).toBe("案件A");
  });

  it("オプション列が無効なら開始日・カテゴリ列は出さない", () => {
    const csv = buildRedmineCsv([row({ category: "案件A" })], tags, config);
    expect(csv.split("\r\n")[0]).not.toContain("カテゴリ");
    expect(csv).not.toContain("案件A");
  });
});

describe("selectRedmineRows: 任意フィールド", () => {
  it("開始日は createdAt の日付、カテゴリは task.category を引き継ぐ", () => {
    const rows = selectRedmineRows(
      [task({ createdAt: "2026-05-10T08:30:00.000Z", category: "案件A" })],
      [],
      PERIOD,
    );
    expect(rows[0].startDate).toBe("2026-05-10");
    expect(rows[0].category).toBe("案件A");
  });

  it("ひな型展開行は開始日なし・カテゴリはひな型から継承", () => {
    const rows = selectRedmineRows([], [template({ category: "定例" })], PERIOD);
    expect(rows[0].startDate).toBeNull();
    expect(rows[0].category).toBe("定例");
  });
});
