// テーマ適用(仕様書 §7.2 表示: ライト / ダーク / システム連動)
// documentElement に `dark` クラスと color-scheme を反映する。
// Tailwind のダーク variant はクラス方式(index.css の @custom-variant)で連動する。
// システム連動時は prefers-color-scheme の変化を監視する。

import type { AppSettings } from "../types/models";

let mql: MediaQueryList | null = null;
let listener: ((e: MediaQueryListEvent) => void) | null = null;

function setDark(dark: boolean): void {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function applyTheme(theme: AppSettings["theme"]): void {
  // 以前のシステム監視を解除
  if (mql && listener) {
    mql.removeEventListener("change", listener);
    mql = null;
    listener = null;
  }

  if (theme === "system") {
    mql = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mql.matches);
    listener = (e) => setDark(e.matches);
    mql.addEventListener("change", listener);
  } else {
    setDark(theme === "dark");
  }
}
