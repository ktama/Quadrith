// ウィンドウ位置・サイズの保存/復元(設計書 §3 BootstrapSettings.window)
// メインウィンドウ専用。settings.json(ブートストラップ層)に物理座標で保存する。
// 失敗してもアプリは継続する(設計書 §7)。

import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { load as loadStore } from "@tauri-apps/plugin-store";
import type { WindowState } from "../types/models";

const KEY = "window";

async function store() {
  return loadStore("settings.json", { autoSave: true, defaults: {} });
}

export async function restoreWindowState(): Promise<void> {
  try {
    const w = await (await store()).get<WindowState>(KEY);
    if (!w) return;
    const win = getCurrentWindow();
    await win.setSize(new PhysicalSize(w.width, w.height));
    await win.setPosition(new PhysicalPosition(w.x, w.y));
  } catch (e) {
    console.error("restore window state failed:", e);
  }
}

// 移動・リサイズを監視し、500ms デバウンスで保存する。最小化中(サイズ0)は保存しない。
export async function watchWindowState(): Promise<() => void> {
  const win = getCurrentWindow();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const pos = await win.outerPosition();
        const size = await win.innerSize();
        if (size.width === 0 || size.height === 0) return;
        const value: WindowState = {
          x: pos.x,
          y: pos.y,
          width: size.width,
          height: size.height,
        };
        const s = await store();
        await s.set(KEY, value);
        await s.save();
      } catch (e) {
        console.error("save window state failed:", e);
      }
    }, 500);
  };

  const unMoved = await win.onMoved(save);
  const unResized = await win.onResized(save);
  return () => {
    unMoved();
    unResized();
    clearTimeout(timer);
  };
}
