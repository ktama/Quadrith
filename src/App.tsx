import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ArchiveView } from "./components/archive/ArchiveView";
import { CardContextMenu } from "./components/common/CardContextMenu";
import { FilterChips } from "./components/common/FilterChips";
import { SearchBox, TagFilterChips, ViewTabs } from "./components/common/HeaderControls";
import { Reminders } from "./components/common/Reminders";
import { DbErrorScreen, DbMissingDialog } from "./components/common/StartupDialogs";
import { ResizeHandles } from "./components/common/ResizeHandles";
import { ToastContainer } from "./components/common/Toast";
import { WindowControls } from "./components/common/WindowControls";
import { KanbanView } from "./components/kanban/KanbanView";
import { InboxLane } from "./components/matrix/InboxLane";
import { MatrixView } from "./components/matrix/MatrixView";
import { TaskCardBody } from "./components/matrix/TaskCard";
import { DetailPanel } from "./components/panel/DetailPanel";
import { SettingsView } from "./components/settings/SettingsView";
import { StatsView } from "./components/stats/StatsView";
import { listBackups, restoreBackup } from "./lib/backup";
import {
  checkDbAvailability,
  getBackupDir,
  getStoredDbPath,
  readThemePref,
  recoverDbPath,
  type RecoverMode,
} from "./lib/db";
import { initCloseToTray, registerQuickAddHotkey, syncAutostart } from "./lib/desktop";
import { listenNotificationFired, syncDueNotifications, todayLocal } from "./lib/notifications";
import { applyTheme } from "./lib/theme";
import { restoreWindowState, watchWindowState } from "./lib/windowState";
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

type BootPhase = "checking" | "missing" | "error" | "ready";

export default function App() {
  const loading = useTaskStore((s) => s.loading);
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);

  const [phase, setPhase] = useState<BootPhase>("checking");
  const [missingPath, setMissingPath] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [backups, setBackups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // ダイアログのコールバックから初期化を呼べるよう、最新の関数を ref に保持する
  const runInitRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    const cleanups: (() => void)[] = [];

    // DB接続成功後の OS 連携・監視・定時処理(一度だけ登録、アンマウントで解除)
    const setupAfterReady = async () => {
      const appSettings = useSettingsStore.getState().settings;
      void registerQuickAddHotkey(appSettings.quickAddHotkey);
      void syncAutostart(appSettings.autoStart);
      cleanups.push(await initCloseToTray());
      cleanups.push(await listenNotificationFired());
      // クイック追加ウィンドウは DB を持たず、本体にイベントで依頼する(接続を1本に)
      cleanups.push(
        await listen<string>("quick-add-submit", (e) => void useTaskStore.getState().add(e.payload)),
      );
      cleanups.push(await watchWindowState());
      await syncDueNotifications();

      // タスク変更時に通知予定を再登録(1秒デバウンス)
      let debounce: ReturnType<typeof setTimeout> | undefined;
      cleanups.push(
        useTaskStore.subscribe((s, prev) => {
          if (s.tasks !== prev.tasks) {
            clearTimeout(debounce);
            debounce = setTimeout(() => void syncDueNotifications(), 1000);
          }
        }),
      );
      cleanups.push(() => clearTimeout(debounce));

      // アーカイブ判定の定時再評価(設計書 §5.4)+ 日付変更時の通知再登録
      let lastDate = todayLocal();
      const timer = setInterval(() => {
        useUiStore.getState().tick();
        const today = todayLocal();
        if (today !== lastDate) {
          lastDate = today;
          void syncDueNotifications();
        }
      }, 60_000);
      cleanups.push(() => clearInterval(timer));
    };

    const runInit = async () => {
      setPhase("checking");
      try {
        // settingsStore.init() が最初に getDb() を呼び、
        // 起動時バックアップ → DB load → マイグレーションが走る(設計書 §5.1)
        await useSettingsStore.getState().init();
        await Promise.all([useTaskStore.getState().load(), useTagStore.getState().load()]);
        if (cancelled) return;
        await setupAfterReady();
        if (cancelled) return;
        setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        // DB open/マイグレーション失敗 → バックアップ復元を提示(仕様書 §7, §5.1-5)
        const dir = await getBackupDir().catch(() => "");
        const list = dir ? await listBackups(dir).catch(() => []) : [];
        if (cancelled) return;
        setErrorMsg(String(e));
        setBackups(list);
        setPhase("error");
      }
    };
    runInitRef.current = runInit;

    (async () => {
      // テーマを DB ロード前に適用してチラつき(FOUC)を防ぐ(ブートストラップ層のキャッシュ)
      const cachedTheme = await readThemePref().catch(() => null);
      if (cachedTheme) applyTheme(cachedTheme);
      // ウィンドウ位置・サイズの復元(設計書 §3)
      await restoreWindowState();
      // 起動時のDB存在チェック(仕様書 §7.4)
      const avail = await checkDbAvailability();
      if (cancelled) return;
      if (avail.status === "missing") {
        setMissingPath(avail.path);
        setPhase("missing");
        return;
      }
      await runInit();
    })();

    return () => {
      cancelled = true;
      for (const fn of cleanups) fn();
    };
  }, []);

  const handleRecover = async (mode: RecoverMode, locatedPath?: string) => {
    setBusy(true);
    await recoverDbPath(mode, locatedPath);
    setBusy(false);
    await runInitRef.current();
  };

  const handleRestore = async (name: string) => {
    setBusy(true);
    const path = await getStoredDbPath().catch(() => "");
    const dir = await getBackupDir().catch(() => "");
    if (path && dir) await restoreBackup(path, dir, name).catch(() => {});
    setBusy(false);
    await runInitRef.current();
  };

  if (phase === "missing") {
    return <DbMissingDialog path={missingPath} busy={busy} onRecover={(m, p) => void handleRecover(m, p)} />;
  }
  if (phase === "error") {
    return (
      <DbErrorScreen
        message={errorMsg}
        backups={backups}
        busy={busy}
        onRestore={(name) => void handleRestore(name)}
        onRetry={() => void runInitRef.current()}
      />
    );
  }
  if (phase === "checking") {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-slate-900 text-sm text-slate-400">
        読み込み中...
      </div>
    );
  }

  // フィルタ行はタスク一覧系ビューでのみ意味があるため、統計/設定では隠す
  const showFilters = view === "matrix" || view === "kanban" || view === "archive";

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex flex-col bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 shrink-0">
        {/* タイトルバー行(枠なしウィンドウ: ドラッグ移動 + ウィンドウ操作) */}
        <div className="flex items-stretch h-9">
          <div
            data-tauri-drag-region
            className="flex items-center gap-2 pl-3 pr-2 cursor-default"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" className="shrink-0 pointer-events-none" aria-hidden="true">
              <defs>
                <linearGradient id="logoG" x1="0" y1="0" x2="20" y2="20">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#4338ca" />
                </linearGradient>
              </defs>
              <rect width="20" height="20" rx="5" fill="url(#logoG)" />
              <rect x="4" y="4" width="5" height="5" rx="1.2" fill="#fff" opacity="0.95" />
              <rect x="11" y="4" width="5" height="5" rx="1.2" fill="#fff" opacity="0.5" />
              <rect x="4" y="11" width="5" height="5" rx="1.2" fill="#fff" opacity="0.5" />
              <rect x="11" y="11" width="5" height="5" rx="1.2" fill="#fff" opacity="0.78" />
            </svg>
            <h1 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100 pointer-events-none">
              Quadrith
            </h1>
          </div>
          <div className="flex items-center">
            <ViewTabs />
          </div>
          {/* ドラッグ用の余白 */}
          <div data-tauri-drag-region className="flex-1 self-stretch" />
          <div className="flex items-center gap-2 pr-1">
            {loading && <span className="text-xs text-slate-400">読み込み中...</span>}
            <SearchBox />
            <Reminders />
            <button
              className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 ${
                view === "settings" ? "text-blue-500" : "text-slate-500 dark:text-slate-300"
              }`}
              title="設定"
              aria-label="設定"
              onClick={() => setView("settings")}
            >
              <span className="text-base" aria-hidden="true">
                ⚙
              </span>
            </button>
          </div>
          <WindowControls />
        </div>
        {showFilters && (
          <div className="flex items-center gap-4 flex-wrap px-3 pb-1.5">
            <FilterChips />
            <TagFilterChips />
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 flex flex-col min-w-0">
          {view === "matrix" && (
            <>
              <MatrixView />
              <InboxLane />
            </>
          )}
          {view === "kanban" && <KanbanView />}
          {view === "archive" && <ArchiveView />}
          {view === "stats" && <StatsView />}
          {view === "settings" && <SettingsView />}
        </main>
        {view !== "settings" && <DetailPanel />}
      </div>

      <DragOverlay />
      <CardContextMenu />
      <ToastContainer />
      <ResizeHandles />
    </div>
  );
}
