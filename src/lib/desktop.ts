// OS 連携の初期化(メインウィンドウ専用)
// - グローバルホットキー → クイック追加ウィンドウの表示
// - 閉じるボタン → トレイへ最小化(closeToTray 設定時)
// いずれも失敗時は機能を無効化してアプリは継続する(設計書 §7)。

import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isRegistered, register } from "@tauri-apps/plugin-global-shortcut";
import { useSettingsStore } from "../stores/settingsStore";

// React StrictMode の二重マウントで register/unregister が競合しないよう、
// アプリ存続中は登録しっぱなしにする(ホットキー変更は再起動で反映)。
let hotkeyInitialized = false;

export async function registerQuickAddHotkey(hotkey: string): Promise<void> {
  if (hotkeyInitialized) return;
  hotkeyInitialized = true;
  try {
    if (await isRegistered(hotkey)) return; // 多重起動・リロード時
    await register(hotkey, (event) => {
      if (event.state === "Pressed") void showQuickAddWindow();
    });
  } catch (e) {
    console.error("global shortcut registration failed:", e);
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
