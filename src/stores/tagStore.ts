import { create } from "zustand";
import * as tagRepo from "../repositories/tagRepo";
import type { Tag } from "../types/models";
import { useTaskStore } from "./taskStore";
import { useToastStore } from "./toastStore";
import { useUiStore } from "./uiStore";

interface TagState {
  tags: Tag[];
  load: () => Promise<void>;
  create: (name: string, color: string) => Promise<Tag | null>;
  rename: (id: string, name: string) => Promise<void>;
  recolor: (id: string, color: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function sortByName(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name));
}

export const useTagStore = create<TagState>()((set, get) => ({
  tags: [],

  load: async () => {
    const res = await tagRepo.findAll();
    if (res.ok) {
      set({ tags: res.value });
    } else {
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  create: async (name, color) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const res = await tagRepo.create(trimmed, color);
    if (!res.ok) {
      useToastStore.getState().show(res.error.message, { kind: "error" });
      return null;
    }
    set((s) => ({ tags: sortByName([...s.tags, res.value]) }));
    return res.value;
  },

  rename: async (id, name) => {
    const trimmed = name.trim();
    const prev = get().tags;
    const target = prev.find((t) => t.id === id);
    if (!target || !trimmed || trimmed === target.name) return;
    set({ tags: sortByName(prev.map((t) => (t.id === id ? { ...t, name: trimmed } : t))) });
    const res = await tagRepo.rename(id, trimmed);
    if (!res.ok) {
      set({ tags: prev });
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  recolor: async (id, color) => {
    const prev = get().tags;
    set({ tags: prev.map((t) => (t.id === id ? { ...t, color } : t)) });
    const res = await tagRepo.recolor(id, color);
    if (!res.ok) {
      set({ tags: prev });
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },

  remove: async (id) => {
    const prev = get().tags;
    set({ tags: prev.filter((t) => t.id !== id) });
    const res = await tagRepo.remove(id);
    if (res.ok) {
      // メモリ上の全タスクからも取り除き、タグ絞り込みからも外す
      useTaskStore.getState().stripTag(id);
      const ui = useUiStore.getState();
      if (ui.tagFilter.includes(id)) ui.toggleTagFilter(id);
    } else {
      set({ tags: prev });
      useToastStore.getState().show(res.error.message, { kind: "error" });
    }
  },
}));
