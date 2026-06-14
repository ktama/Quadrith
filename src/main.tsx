import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { QuickAddPopup } from "./components/QuickAddPopup";
// フォントはオフライン同梱(仕様§6 外部通信なし): Inter(可変) + Noto Sans JP(日本語)
import "@fontsource-variable/inter";
import "@fontsource/noto-sans-jp/japanese-400.css";
import "@fontsource/noto-sans-jp/japanese-500.css";
import "@fontsource/noto-sans-jp/japanese-700.css";
import "./index.css";

// 同じバンドルを main / quickadd の2ウィンドウで共用し、ラベルで振り分ける
const isQuickAdd = getCurrentWindow().label === "quickadd";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isQuickAdd ? <QuickAddPopup /> : <App />}</React.StrictMode>,
);
