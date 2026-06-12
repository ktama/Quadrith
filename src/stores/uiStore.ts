import { create } from "zustand";
import { STATUSES, type Status } from "../types/models";

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
  selectedTaskId: string | null;
  statusFilter: Status[];
  dragging: DragState | null;
  now: number; // アーカイブ判定の再評価用(1分ごとに更新)

  select: (id: string | null) => void;
  toggleStatusFilter: (status: Status) => void;
  startDrag: (id: string, offsetX: number, offsetY: number, x: number, y: number) => void;
  updateDrag: (x: number, y: number) => void;
  endDrag: () => void;
  tick: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  selectedTaskId: null,
  statusFilter: [...STATUSES],
  dragging: null,
  now: Date.now(),

  select: (id) => set({ selectedTaskId: id }),

  toggleStatusFilter: (status) =>
    set((s) => ({
      statusFilter: s.statusFilter.includes(status)
        ? s.statusFilter.filter((x) => x !== status)
        : [...s.statusFilter, status],
    })),

  startDrag: (id, offsetX, offsetY, x, y) => set({ dragging: { id, offsetX, offsetY, x, y } }),

  updateDrag: (x, y) =>
    set((s) => (s.dragging ? { dragging: { ...s.dragging, x, y } } : s)),

  endDrag: () => set({ dragging: null }),

  tick: () => set({ now: Date.now() }),
}));
