// OS 連携(メインウィンドウ専用)
// - グローバルホットキー → クイック追加ウィンドウの表示(設定で変更可能・即時再登録)
// - 閉じるボタン → トレイへ最小化(closeToTray 設定時)
// - Windows 起動時の常駐(autostart)/ DBフォルダをエクスプローラで開く
// いずれも失敗時は機能を無効化してアプリは継続する(設計書 §7)。

import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { isRegistered, register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { err, ok, type Result } from "./result";
import { useSettingsStore } from "../stores/settingsStore";

let currentHotkey: string | null = null;

// ホットキーの登録。設定変更時にも呼ばれ、旧キーを解除して新キーへ差し替える。
// StrictMode の二重マウントや多重起動に備え、登録前に isRegistered で確認する。
export async function registerQuickAddHotkey(hotkey: string): Promise<Result<void>> {
  try {
    if (currentHotkey && currentHotkey !== hotkey && (await isRegistered(currentHotkey))) {
      await unregister(currentHotkey);
    }
    if (!(await isRegistered(hotkey))) {
      await register(hotkey, (event) => {
        if (event.state === "Pressed") void showQuickAddWindow();
      });
    }
    currentHotkey = hotkey;
    return ok(undefined);
  } catch (e) {
    console.error("global shortcut registration failed:", e);
    return err("UNKNOWN", "ホットキーの登録に失敗しました(他アプリと競合の可能性)", e);
  }
}

async function showQuickAddWindow(): Promise<void> {
  const win = await WebviewWindow.getByLabel("quickadd");
  if (!win) return;
  await win.center();
  await win.show();
  await win.setFocus();
}

// 閉じるボタンの挙動(仕様書 §7.2): closeToTray ならトレイへ最小化
export async function initCloseToTray(): Promise<() => void> {
  const win = getCurrentWindow();
  return win.onCloseRequested(async (event) => {
    if (useSettingsStore.getState().settings.closeToTray) {
      event.preventDefault();
      await win.hide();
    }
  });
}

// Windows 起動時の常駐(仕様書 §7.2 動作)
export async function syncAutostart(on: boolean): Promise<void> {
  try {
    const enabled = await isEnabled();
    if (on && !enabled) await enable();
    else if (!on && enabled) await disable();
  } catch (e) {
    console.error("autostart sync failed:", e);
  }
}

// DBファイルの場所をエクスプローラで開く(仕様書 §7.2 データ)
export async function revealInExplorer(path: string): Promise<void> {
  try {
    await revealItemInDir(path);
  } catch (e) {
    console.error("reveal in explorer failed:", e);
  }
}
