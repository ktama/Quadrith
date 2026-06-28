// 定期タスクのひな型一覧と操作(仕様 §4.7、設計書 §5.7)。
// 生成(generateDue)は起動時と日付変更時に App から呼ばれる。
// 生成された実体は通常タスクなので、生成後は taskStore へ流し込む。

import { create } from "zustand";
import { addDaysStr, initialNextDue, nextOnOrAfter, planGeneration } from "../lib/recurrence";
import * as tagRepo from "../repositories/tagRepo";
import * as taskRepo from "../repositories/taskRepo";
import * as templateRepo from "../repositories/templateRepo";
import type { RecurFreq, RecurringTemplate } from "../types/models";
import { useTaskStore } from "./taskStore";
import { useToastStore } from "./toastStore";

export interface TemplateInput {
  title: string;
  memo: string;
  importance: number | null;
  urgency: number | null;
  freq: RecurFreq;
  interval: number;
  byweekday: number[];
  bymonthday: number | null;
  anchorDate: string; // 'YYYY-MM-DD'
  category: string | null;
  tagIds: string[];
  // 既存タスクからのひな型化時 true: anchor 当日ぶんは元タスクが担うので
  // 最初の生成は anchor の翌日以降の発生日からにする(当日の重複生成を防ぐ)。
  skipAnchorOccurrence?: boolean;
}

function todayLocalStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dd}`;
}

interface TemplateState {
  templates: RecurringTemplate[];
  load: () => Promise<void>;
  create: (input: TemplateInput) => Promise<void>;
  update: (id: string, input: TemplateInput) => Promise<void>;
  setActive: (id: string, active: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  stripTag: (tagId: string) => void;
  // today までに発生したひな型の実体を生成する。生成件数を返す。
  generateDue: (today: string) => Promise<number>;
}

function sortByCreated(ts: RecurringTemplate[]): RecurringTemplate[] {
  return [...ts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const useTemplateStore = create<TemplateState>()((set, get) => ({
  templates: [],

  load: async () => {
    const res = await templateRepo.findAll();
    if (res.ok) {
      set({ templates: res.value });
    } else {
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  create: async (input) => {
    const now = new Date().toISOString();
    const base: RecurringTemplate = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      memo: input.memo,
      importance: input.importance,
      urgency: input.urgency,
      freq: input.freq,
      interval: Math.max(1, Math.floor(input.interval)),
      byweekday: [...input.byweekday].sort((a, b) => a - b),
      bymonthday: input.bymonthday,
      anchorDate: input.anchorDate,
      nextDue: input.anchorDate, // 直後に確定値へ置換
      active: true,
      createdAt: now,
      updatedAt: now,
      category: input.category,
      tagIds: input.tagIds,
    };
    const nextDue = input.skipAnchorOccurrence
      ? (nextOnOrAfter(base, addDaysStr(base.anchorDate, 1)) ?? initialNextDue(base))
      : initialNextDue(base);
    const template: RecurringTemplate = { ...base, nextDue };

    const res = await templateRepo.create(template);
    if (!res.ok) {
      useToastStore.getState().show(res.error.message, { kind: "error" });
      return;
    }
    if (template.tagIds.length) {
      await templateRepo.setTemplateTags(template.id, template.tagIds);
    }
    set((s) => ({ templates: sortByCreated([...s.templates, template]) }));
    useToastStore.getState().show(`繰り返し「${template.title}」を登録しました`);
    // 既に発生日を過ぎているひな型は即座に実体を生成する(skip 時は未来日のため no-op)。
    await get().generateDue(todayLocalStr());
  },

  update: async (id, input) => {
    const prev = get().templates.find((t) => t.id === id);
    if (!prev) return;
    // ルール変更時は anchorDate 基準で next_due を再計算する(次回生成以降に反映)。
    const recalc =
      input.freq !== prev.freq ||
      Math.max(1, Math.floor(input.interval)) !== prev.interval ||
      input.byweekday.join(",") !== prev.byweekday.join(",") ||
      input.bymonthday !== prev.bymonthday ||
      input.anchorDate !== prev.anchorDate;
    const next: RecurringTemplate = {
      ...prev,
      title: input.title.trim(),
      memo: input.memo,
      importance: input.importance,
      urgency: input.urgency,
      freq: input.freq,
      interval: Math.max(1, Math.floor(input.interval)),
      byweekday: [...input.byweekday].sort((a, b) => a - b),
      bymonthday: input.bymonthday,
      anchorDate: input.anchorDate,
      category: input.category,
      tagIds: input.tagIds,
      updatedAt: new Date().toISOString(),
    };
    next.nextDue = recalc ? initialNextDue(next) : prev.nextDue;

    set((s) => ({ templates: s.templates.map((t) => (t.id === id ? next : t)) }));
    const res = await templateRepo.update(next);
    if (!res.ok) {
      set((s) => ({ templates: s.templates.map((t) => (t.id === id ? prev : t)) }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
      return;
    }
    await templateRepo.setTemplateTags(id, next.tagIds);
  },

  setActive: async (id, active) => {
    const prev = get().templates.find((t) => t.id === id);
    if (!prev) return;
    const next: RecurringTemplate = { ...prev, active, updatedAt: new Date().toISOString() };
    set((s) => ({ templates: s.templates.map((t) => (t.id === id ? next : t)) }));
    const res = await templateRepo.update(next);
    if (!res.ok) {
      set((s) => ({ templates: s.templates.map((t) => (t.id === id ? prev : t)) }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // シリーズ削除: ひな型を削除する。生成済みの実体は通常タスクとして残す。
  remove: async (id) => {
    const prev = get().templates.find((t) => t.id === id);
    if (!prev) return;
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }));
    const res = await templateRepo.remove(id);
    if (!res.ok) {
      set((s) => ({ templates: sortByCreated([...s.templates, prev]) }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  stripTag: (tagId) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.tagIds.includes(tagId) ? { ...t, tagIds: t.tagIds.filter((x) => x !== tagId) } : t,
      ),
    })),

  generateDue: async (today) => {
    let generated = 0;
    for (const t of get().templates) {
      if (!t.active) continue;
      const plan = planGeneration(t, today);

      if (plan.due && plan.dueDate) {
        // 重複防止: 当該ひな型由来で未完了の実体が既にあれば生成しない
        const hasOpen = useTaskStore
          .getState()
          .tasks.some((task) => task.templateId === t.id && task.status !== "done");
        if (!hasOpen) {
          const res = await taskRepo.create({
            title: t.title,
            memo: t.memo,
            importance: t.importance,
            urgency: t.urgency,
            status: "todo",
            dueDate: plan.dueDate,
            templateId: t.id,
            category: t.category,
          });
          if (res.ok) {
            let task = res.value;
            if (t.tagIds.length) {
              await tagRepo.setTaskTags(task.id, t.tagIds);
              task = { ...task, tagIds: t.tagIds };
            }
            useTaskStore.setState((s) => ({ tasks: [...s.tasks, task] }));
            generated++;
          } else {
            useToastStore.getState().show(res.error.message, { kind: "error" });
            continue; // next_due は前進させない(次回再試行)
          }
        }
      }

      // next_due を前進(発生済み・未発生いずれも確定値へ)。
      if (plan.nextDue !== t.nextDue) {
        const now = new Date().toISOString();
        const advanced: RecurringTemplate = { ...t, nextDue: plan.nextDue, updatedAt: now };
        set((s) => ({ templates: s.templates.map((x) => (x.id === t.id ? advanced : x)) }));
        await templateRepo.updateNextDue(t.id, plan.nextDue, now);
      }
    }
    return generated;
  },
}));
