// pointer イベントによるカードドラッグ(設計書 §5.2)
// - ドラッグ中は uiStore のローカル状態のみ更新(DB 書込なし)
// - pointerup でドロップ先を判定し、マトリクス内なら px→正規化変換して保存、
//   インボックスレーン上なら座標を外して差し戻し
// - 移動量が閾値未満ならクリック扱い → 詳細パネルを開く

import type React from "react";
import { clamp01, pxToNorm } from "../lib/coords";
import { dragTargets } from "../lib/dragTargets";
import { useTaskStore } from "../stores/taskStore";
import { useUiStore } from "../stores/uiStore";

const CLICK_THRESHOLD_PX = 5;

function contains(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function useDragCard(taskId: string) {
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();

    // 修飾キー押下時はドラッグ移動せず、選択集合のトグルに専念する(複数選択)
    if (e.ctrlKey || e.metaKey) {
      useUiStore.getState().toggleSelect(taskId);
      return;
    }

    const cardRect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - cardRect.left;
    const offsetY = e.clientY - cardRect.top;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) >= CLICK_THRESHOLD_PX) {
        moved = true;
        useUiStore.getState().startDrag(taskId, offsetX, offsetY, ev.clientX, ev.clientY);
      }
      if (moved) {
        useUiStore.getState().updateDrag(ev.clientX, ev.clientY);
      }
    };

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      useUiStore.getState().endDrag();

      if (!moved) {
        useUiStore.getState().select(taskId);
        return;
      }

      const inboxRect = dragTargets.inboxEl?.getBoundingClientRect();
      const matrixRect = dragTargets.matrixEl?.getBoundingClientRect();
      const tasks = useTaskStore.getState();

      // 掴んだカードが複数選択に含まれていれば、選択分をまとめて動かす(相対位置を保持)
      const selectedIds = useUiStore.getState().selectedIds;
      const groupIds =
        selectedIds.length >= 2 && selectedIds.includes(taskId) ? selectedIds : [taskId];

      if (inboxRect && contains(inboxRect, ev.clientX, ev.clientY)) {
        for (const id of groupIds) void tasks.moveTo(id, null, null);
      } else if (matrixRect && contains(matrixRect, ev.clientX, ev.clientY)) {
        const px = ev.clientX - matrixRect.left - offsetX;
        const py = ev.clientY - matrixRect.top - offsetY;
        const dropped = pxToNorm(px, py, matrixRect.width, matrixRect.height);
        if (groupIds.length === 1) {
          void tasks.moveTo(taskId, dropped.importance, dropped.urgency);
        } else {
          // 掴んだカードの移動量(Δ)を、座標を持つ選択カード全部へ適用
          const dragged = tasks.tasks.find((t) => t.id === taskId);
          if (dragged && dragged.importance !== null && dragged.urgency !== null) {
            const dImp = dropped.importance - dragged.importance;
            const dUrg = dropped.urgency - dragged.urgency;
            for (const id of groupIds) {
              const t = tasks.tasks.find((x) => x.id === id);
              if (!t || t.importance === null || t.urgency === null) continue;
              void tasks.moveTo(id, clamp01(t.importance + dImp), clamp01(t.urgency + dUrg));
            }
          }
        }
      }
      // どちらでもない場所へのドロップは何もしない(元の位置に戻る)
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return { onPointerDown };
}
