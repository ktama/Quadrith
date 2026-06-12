import { create } from "zustand";
import * as tagRepo from "../repositories/tagRepo";
import type { Tag } from "../types/models";
import { useToastStore } from "./toastStore";

interface TagState {
  tags: Tag[];
  load: () => Promise<void>;
  create: (name: string, color: string) => Promise<Tag | null>;
}

export const useTagStore = create<TagState>()((set) => ({
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
    set((s) => ({ tags: [...s.tags, res.value].sort((a, b) => a.name.localeCompare(b.name)) }));
    return res.value;
  },
}));
