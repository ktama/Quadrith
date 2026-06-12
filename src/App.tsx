import { useEffect, useState } from "react";
import { FilterChips } from "./components/common/FilterChips";
import { ToastContainer } from "./components/common/Toast";
import { InboxLane } from "./components/matrix/InboxLane";
import { MatrixView } from "./components/matrix/MatrixView";
import { TaskCardBody } from "./components/matrix/TaskCard";
import { DetailPanel } from "./components/panel/DetailPanel";
import { useSettingsStore } from "./stores/settingsStore";
import { useTagStore } from "./stores/tagStore";
import { useTaskStore } from "./stores/taskStore";
import { useUiStore } from "./stores/uiStore";

// ドラッグ中のカードをポインタに追従させるオーバーレイ(DB書込なしの描画専用)
function DragOverlay() {
  const dragging = useUiStore((s) => s.dragging);
  const task = useTaskStore((s) =>
    dragging ? s.tasks.find((t) => t.id === dragging.id) : undefined,
  );
  if (!dragging || !task) return null;
  return (
    <div
      className="fixed z-50 pointer-events-none opacity-90"
      style={{ left: dragging.x - dragging.offsetX, top: dragging.y - dragging.offsetY }}
    >
      <TaskCardBody task={task} selected={false} />
    </div>
  );
}

export default function App() {
  const loading = useTaskStore((s) => s.loading);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // settingsStore.init() が最初に getDb() を呼び、
        // 起動時バックアップ → DB load → マイグレーションが走る(設計書 §5.1)
        await useSettingsStore.getState().init();
        await Promise.all([useTaskStore.getState().load(), useTagStore.getState().load()]);
      } catch (e) {
        if (!cancelled) setInitError(String(e));
      }
    })();

    // アーカイブ判定の定時再評価(設計書 §5.4)
    const timer = setInterval(() => useUiStore.getState().tick(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (initError) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md bg-white border border-red-200 rounded-lg p-6 shadow">
          <h1 className="text-lg font-bold text-red-600 mb-2">データベースを開けませんでした</h1>
          <p className="text-sm text-slate-600 break-all">{initError}</p>
          <p className="text-xs text-slate-400 mt-3">
            %APPDATA%/com.quadrith.app/backups/ に自動バックアップがあります。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center gap-4 px-4 py-2 bg-white border-b border-slate-300 shrink-0">
        <h1 className="text-base font-bold text-slate-700">Quadrith</h1>
        <FilterChips />
        {loading && <span className="text-xs text-slate-400 ml-auto">読み込み中...</span>}
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          <MatrixView />
          <InboxLane />
        </main>
        <DetailPanel />
      </div>

      <DragOverlay />
      <ToastContainer />
    </div>
  );
}
