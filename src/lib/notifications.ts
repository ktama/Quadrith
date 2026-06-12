// 期限通知の連携(設計書 §4.6)
// Rust 側スケジューラに「今日が期限のタスク」を登録し、notifyTime に
// Windows トーストを発火させる。Rust は DB を読まないため、起動時・タスク変更時・
// 日付変更時にフロントから再登録する。
// 同日二重通知の防止は DB 内 settings の lastNotifiedDate で行う。

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getRawSetting, setRawSetting } from "../repositories/settingsRepo";
import { useSettingsStore } from "../stores/settingsStore";
import { useTaskStore } from "../stores/taskStore";

const LAST_NOTIFIED_KEY = "lastNotifiedDate";

export function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function syncDueNotifications(): Promise<void> {
  try {
    const today = todayLocal();
    const titles = useTaskStore
      .getState()
      .tasks.filter((t) => t.dueDate === today && t.status !== "done")
      .map((t) => t.title);
    const notifyTime = useSettingsStore.getState().settings.notifyTime;
    const alreadyNotified = (await getRawSetting(LAST_NOTIFIED_KEY)) === today;
    await invoke("schedule_notifications", { notifyTime, titles, alreadyNotified });
  } catch (e) {
    // 通知は補助機能。失敗してもアプリは継続(設計書 §7)
    console.error("schedule_notifications failed:", e);
  }
}

// Rust 側が通知を発火したら lastNotifiedDate を永続化する
export async function listenNotificationFired(): Promise<() => void> {
  return listen<string>("due-notified", (event) => {
    void setRawSetting(LAST_NOTIFIED_KEY, event.payload);
  });
}
