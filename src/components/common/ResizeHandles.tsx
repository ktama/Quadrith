// 枠なしウィンドウ(decorations:false)の縁ドラッグ・リサイズを保証する(Windows対策)。
// 各辺・各角に細い透明ハンドルを置き、startResizeDragging を呼ぶ。

import { getCurrentWindow } from "@tauri-apps/api/window";

// startResizeDragging の引数型(ResizeDirection)はパッケージ外に公開されていないため、
// メソッドシグネチャから取り出す。
type Dir = Parameters<ReturnType<typeof getCurrentWindow>["startResizeDragging"]>[0];

function handle(dir: Dir, className: string, cursor: string) {
  return (
    <div
      key={String(dir)}
      className={`fixed z-[60] ${className}`}
      style={{ cursor }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        void getCurrentWindow().startResizeDragging(dir);
      }}
    />
  );
}

export function ResizeHandles() {
  return (
    <>
      {handle("North", "top-0 left-2 right-2 h-1", "ns-resize")}
      {handle("South", "bottom-0 left-2 right-2 h-1", "ns-resize")}
      {handle("West", "left-0 top-2 bottom-2 w-1", "ew-resize")}
      {handle("East", "right-0 top-2 bottom-2 w-1", "ew-resize")}
      {handle("NorthWest", "top-0 left-0 w-2 h-2", "nwse-resize")}
      {handle("NorthEast", "top-0 right-0 w-2 h-2", "nesw-resize")}
      {handle("SouthWest", "bottom-0 left-0 w-2 h-2", "nesw-resize")}
      {handle("SouthEast", "bottom-0 right-0 w-2 h-2", "nwse-resize")}
    </>
  );
}
