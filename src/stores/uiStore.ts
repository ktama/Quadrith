import { create } from "zustand";
import { STATUSES, type Status } from "../types/models";

export type View = "matrix" | "kanban" | "recurring" | "archive" | "stats" | "settings";

export interface DragState {
  id: string;
  // つかんだ位置のカード左上からのオフセット(px)
  offsetX: number;
  offsetY: number;
  // 現在のポインタ位置(クライアント座標)
  x: number;
  y: number;
}

interface UiState {
  view: View;
  selectedTaskId: string | null;
  statusFilter: Status[];
  tagFilter: string[]; // 空 = 全タグ
  searchQuery: string;
  dragging: DragState | null;
  openClusterId: string | null; // 展開中の「+N」吹き出し
  contextMenu: { taskId: string; x: number; y: number } | null; // カード右クリックメニュー
  now: number; // アーカイブ判定の再評価用(1分ごとに更新)

  setView: (view: View) => void;
  select: (id: string | null) => void;
  toggleStatusFilter: (status: Status) => void;
  toggleTagFilter: (tagId: string) => void;
  setSearchQuery: (q: string) => void;
  setOpenClusterId: (id: string | null) => void;
  openContextMenu: (taskId: string, x: number, y: number) => void;
  closeContextMenu: () => void;
  startDrag: (id: string, offsetX: number, offsetY: number, x: number, y: number) => void;
  updateDrag: (x: number, y: number) => void;
  endDrag: () => void;
  tick: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  view: "matrix",
  selectedTaskId: null,
  statusFilter: [...STATUSES],
  tagFilter: [],
  searchQuery: "",
  dragging: null,
  openClusterId: null,
  contextMenu: null,
  now: Date.now(),

  setView: (view) => set({ view, openClusterId: null, contextMenu: null }),

  select: (id) => set({ selectedTaskId: id }),

  toggleStatusFilter: (status) =>
    set((s) => ({
      statusFilter: s.statusFilter.includes(status)
        ? s.statusFilter.filter((x) => x !== status)
        : [...s.statusFilter, status],
    })),

  toggleTagFilter: (tagId) =>
    set((s) => ({
      tagFilter: s.tagFilter.includes(tagId)
        ? s.tagFilter.filter((x) => x !== tagId)
        : [...s.tagFilter, tagId],
    })),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setOpenClusterId: (id) => set({ openClusterId: id }),

  openContextMenu: (taskId, x, y) => set({ contextMenu: { taskId, x, y } }),

  closeContextMenu: () => set({ contextMenu: null }),

  startDrag: (id, offsetX, offsetY, x, y) => set({ dragging: { id, offsetX, offsetY, x, y } }),

  updateDrag: (x, y) =>
    set((s) => (s.dragging ? { dragging: { ...s.dragging, x, y } } : s)),

  endDrag: () => set({ dragging: null }),

  tick: () => set({ now: Date.now() }),
}));
