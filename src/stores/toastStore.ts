import { create } from "zustand";

export interface ToastItem {
  id: number;
  message: string;
  kind: "info" | "error";
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastState {
  toasts: ToastItem[];
  show: (
    message: string,
    opts?: {
      kind?: "info" | "error";
      actionLabel?: string;
      onAction?: () => void;
      durationMs?: number;
    },
  ) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],

  show: (message, opts) => {
    const id = nextId++;
    const toast: ToastItem = {
      id,
      message,
      kind: opts?.kind ?? "info",
      actionLabel: opts?.actionLabel,
      onAction: opts?.onAction,
    };
    set((s) => ({ toasts: [...s.toasts, toast] }));
    setTimeout(() => get().dismiss(id), opts?.durationMs ?? 5000);
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
