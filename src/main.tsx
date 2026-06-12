import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { QuickAddPopup } from "./components/QuickAddPopup";
import "./index.css";

// 同じバンドルを main / quickadd の2ウィンドウで共用し、ラベルで振り分ける
const isQuickAdd = getCurrentWindow().label === "quickadd";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{isQuickAdd ? <QuickAddPopup /> : <App />}</React.StrictMode>,
);
