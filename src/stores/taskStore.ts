// タスク一覧と操作(設計書 §4.4)
// 書込はすべて楽観更新: UI を即時反映し、DB 書込が失敗したら巻き戻してトースト表示。

import { create } from "zustand";
import { partitionByResult } from "../lib/result";
import * as tagRepo from "../repositories/tagRepo";
import * as taskRepo from "../repositories/taskRepo";
import type { Status, Task } from "../types/models";
import { useToastStore } from "./toastStore";
import { useUiStore } from "./uiStore";

interface TaskState {
  tasks: Task[];
  trashed: Task[]; // ごみ箱(アーカイブビューで表示時に取得)
  loading: boolean;
  lastRemoved: Task[]; // 直近の削除分(単一・一括とも)。1回の Undo でまとめて復元

  load: () => Promise<void>;
  add: (title: string) => Promise<void>;
  patch: (id: string, partial: taskRepo.TaskPatch) => Promise<void>;
  moveTo: (id: string, importance: number | null, urgency: number | null) => Promise<void>;
  setStatus: (id: string, status: Status) => Promise<void>;
  setTags: (id: string, tagIds: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeMany: (ids: string[]) => Promise<void>;
  undoRemove: () => Promise<void>;
  loadTrashed: () => Promise<void>;
  restoreFromTrash: (id: string) => Promise<void>;
  purgeForever: (id: string) => Promise<void>;
  stripTag: (tagId: string) => void;
}

function sortByCreated(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  trashed: [],
  loading: false,
  lastRemoved: [],

  load: async () => {
    set({ loading: true });
    await taskRepo.purgeExpired(); // 起動時の物理削除(失敗しても続行)
    const res = await taskRepo.findAllAlive();
    if (res.ok) {
      set({ tasks: res.value, loading: false });
    } else {
      set({ loading: false });
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // クイック追加: 座標 null(インボックス)・未着手で作成(仕様書 §4.4)
  add: async (title) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const res = await taskRepo.create({ title: trimmed });
    if (res.ok) {
      set((s) => ({ tasks: [...s.tasks, res.value] }));
    } else {
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // updatedAt はストアと DB で同一値になるよう、ここで生成して repo へ渡す。
  patch: async (id, partial) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return;
    const now = new Date().toISOString();
    const next: Task = { ...prev, ...partial, updatedAt: now };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    const res = await taskRepo.update(id, partial, now);
    if (!res.ok) {
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? prev : t)) }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // ドラッグ確定時の座標保存。null はインボックスへの差し戻し。
  // 配置変更は「進捗」ではないため lastProgressAt は据え置く(放置リマインド)。
  moveTo: async (id, importance, urgency) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return;
    const now = new Date().toISOString();
    const next: Task = { ...prev, importance, urgency, updatedAt: now };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    const res = await taskRepo.updatePosition(id, importance, urgency, now);
    if (!res.ok) {
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? prev : t)) }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // 状態変更は「進捗」とみなし lastProgressAt も更新する(放置リマインドの基準)。
  setStatus: async (id, status) => {
    const now = new Date().toISOString();
    const completedAt = status === "done" ? now : null;
    await get().patch(id, { status, completedAt, lastProgressAt: now });
  },

  setTags: async (id, tagIds) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return;
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, tagIds } : t)) }));
    const res = await tagRepo.setTaskTags(id, tagIds);
    if (!res.ok) {
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? prev : t)) }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // 論理削除 + Undo トースト(設計書 §5.3)
  remove: async (id) => {
    await get().removeMany([id]);
  },

  // 一括論理削除。1回の Undo でまとめて復元する(lastRemoved に全件を保持)
  removeMany: async (ids) => {
    const idSet = new Set(ids);
    const removed = get().tasks.filter((t) => idSet.has(t.id));
    if (removed.length === 0) return;
    set((s) => ({
      tasks: s.tasks.filter((t) => !idSet.has(t.id)),
      lastRemoved: removed,
    }));
    // 選択集合から削除分を取り除く
    const ui = useUiStore.getState();
    if (ui.selectedIds.some((id) => idSet.has(id))) {
      ui.clearSelection();
    }
    const results = await Promise.all(removed.map((t) => taskRepo.softDelete(t.id)));
    const { ok: succeeded, failed } = partitionByResult(removed, results);
    if (failed.length > 0) {
      // 失敗した分だけ巻き戻す
      const failSet = new Set(failed.map((t) => t.id));
      set((s) => ({
        tasks: sortByCreated([...s.tasks, ...failed]),
        lastRemoved: s.lastRemoved.filter((t) => !failSet.has(t.id)),
      }));
      const errRes = results.find((r) => !r.ok);
      if (errRes && !errRes.ok) useToastStore.getState().show(errRes.error.message, { kind: "error" });
    }
    if (succeeded.length === 0) return;
    const label =
      succeeded.length === 1 ? `「${succeeded[0].title}」を削除しました` : `${succeeded.length}件を削除しました`;
    useToastStore.getState().show(label, {
      actionLabel: "元に戻す",
      onAction: () => void get().undoRemove(),
    });
  },

  undoRemove: async () => {
    const removed = get().lastRemoved;
    if (removed.length === 0) return;
    set({ lastRemoved: [] });
    const results = await Promise.all(removed.map((t) => taskRepo.restore(t.id)));
    const { ok: restored } = partitionByResult(removed, results);
    const restoredSet = new Set(restored.map((t) => t.id));
    if (restored.length > 0) {
      set((s) => ({
        tasks: sortByCreated([...s.tasks, ...restored.map((t) => ({ ...t, deletedAt: null }))]),
        trashed: s.trashed.filter((t) => !restoredSet.has(t.id)),
      }));
    }
    const errRes = results.find((r) => !r.ok);
    if (errRes && !errRes.ok) useToastStore.getState().show(errRes.error.message, { kind: "error" });
  },

  loadTrashed: async () => {
    const res = await taskRepo.findTrashed();
    if (res.ok) {
      set({ trashed: res.value });
    } else {
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // ごみ箱からの復元(仕様書 §4.5)
  restoreFromTrash: async (id) => {
    const target = get().trashed.find((t) => t.id === id);
    if (!target) return;
    set((s) => ({ trashed: s.trashed.filter((t) => t.id !== id) }));
    const res = await taskRepo.restore(id);
    if (res.ok) {
      set((s) => ({ tasks: sortByCreated([...s.tasks, { ...target, deletedAt: null }]) }));
      useToastStore.getState().show(`「${target.title}」を復元しました`);
    } else {
      set((s) => ({ trashed: [target, ...s.trashed] }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // ごみ箱からの完全削除(取り消し不可)
  purgeForever: async (id) => {
    const target = get().trashed.find((t) => t.id === id);
    if (!target) return;
    set((s) => ({ trashed: s.trashed.filter((t) => t.id !== id) }));
    const res = await taskRepo.purge(id);
    if (!res.ok) {
      set((s) => ({ trashed: [target, ...s.trashed] }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // タグ削除時に、メモリ上の全タスクから当該タグを取り除く(tagStore から呼ぶ)
  stripTag: (tagId) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.tagIds.includes(tagId) ? { ...t, tagIds: t.tagIds.filter((x) => x !== tagId) } : t,
      ),
      trashed: s.trashed.map((t) =>
        t.tagIds.includes(tagId) ? { ...t, tagIds: t.tagIds.filter((x) => x !== tagId) } : t,
      ),
    })),
}));
