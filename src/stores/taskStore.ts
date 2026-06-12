// タスク一覧と操作(設計書 §4.4)
// 書込はすべて楽観更新: UI を即時反映し、DB 書込が失敗したら巻き戻してトースト表示。

import { create } from "zustand";
import * as tagRepo from "../repositories/tagRepo";
import * as taskRepo from "../repositories/taskRepo";
import type { Status, Task } from "../types/models";
import { useToastStore } from "./toastStore";
import { useUiStore } from "./uiStore";

interface TaskState {
  tasks: Task[];
  loading: boolean;
  lastRemoved: Task | null;

  load: () => Promise<void>;
  add: (title: string) => Promise<void>;
  patch: (id: string, partial: taskRepo.TaskPatch) => Promise<void>;
  moveTo: (id: string, importance: number | null, urgency: number | null) => Promise<void>;
  setStatus: (id: string, status: Status) => Promise<void>;
  setTags: (id: string, tagIds: string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  undoRemove: () => Promise<void>;
}

function sortByCreated(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  loading: false,
  lastRemoved: null,

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

  patch: async (id, partial) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return;
    const next: Task = { ...prev, ...partial, updatedAt: new Date().toISOString() };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    const res = await taskRepo.update(id, partial);
    if (!res.ok) {
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? prev : t)) }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  // ドラッグ確定時の座標保存。null はインボックスへの差し戻し。
  moveTo: async (id, importance, urgency) => {
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return;
    const next: Task = { ...prev, importance, urgency, updatedAt: new Date().toISOString() };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? next : t)) }));
    const res = await taskRepo.updatePosition(id, importance, urgency);
    if (!res.ok) {
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? prev : t)) }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  setStatus: async (id, status) => {
    const completedAt = status === "done" ? new Date().toISOString() : null;
    await get().patch(id, { status, completedAt });
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
    const prev = get().tasks.find((t) => t.id === id);
    if (!prev) return;
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), lastRemoved: prev }));
    if (useUiStore.getState().selectedTaskId === id) {
      useUiStore.getState().select(null);
    }
    const res = await taskRepo.softDelete(id);
    if (!res.ok) {
      set((s) => ({ tasks: sortByCreated([...s.tasks, prev]), lastRemoved: null }));
      useToastStore.getState().show(res.error.message, { kind: "error" });
      return;
    }
    useToastStore.getState().show(`「${prev.title}」を削除しました`, {
      actionLabel: "元に戻す",
      onAction: () => void get().undoRemove(),
    });
  },

  undoRemove: async () => {
    const removed = get().lastRemoved;
    if (!removed) return;
    set({ lastRemoved: null });
    const res = await taskRepo.restore(removed.id);
    if (res.ok) {
      set((s) => ({ tasks: sortByCreated([...s.tasks, { ...removed, deletedAt: null }]) }));
    } else {
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },
}));
