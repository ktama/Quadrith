// 通知スケジューラ(設計書 §4.6)
// Rust 側は DB を直接読まない。フロントが起動時・タスク変更時・日付変更時に
// schedule_notifications コマンドで「今日が期限のタスク名」を登録し、
// 30秒間隔の tokio タスクが notifyTime 以降に一度だけトースト通知を発火する。
// 発火後は "due-notified" イベントでフロントへ通知し、フロントが DB の
// lastNotifiedDate を更新して同日二重通知(再起動時含む)を防ぐ。

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

#[derive(Default)]
pub struct Schedule {
    notify_time: String, // "HH:mm"
    titles: Vec<String>, // 今日が期限の未完了タスク名
    fired_date: Option<String>, // 通知済みの日 "YYYY-MM-DD"
}

#[derive(Default)]
pub struct SchedulerState(Mutex<Schedule>);

#[tauri::command]
pub fn schedule_notifications(
    state: tauri::State<'_, SchedulerState>,
    notify_time: String,
    titles: Vec<String>,
    already_notified: bool,
) {
    let mut schedule = state.0.lock().unwrap();
    schedule.notify_time = notify_time;
    schedule.titles = titles;
    if already_notified {
        schedule.fired_date = Some(today_local());
    }
}

pub fn start(app: &AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            check_and_fire(&handle);
        }
    });
}

fn check_and_fire(app: &AppHandle) {
    let state = app.state::<SchedulerState>();
    let mut schedule = state.0.lock().unwrap();
    if schedule.titles.is_empty() || schedule.notify_time.is_empty() {
        return;
    }
    let today = today_local();
    if schedule.fired_date.as_deref() == Some(today.as_str()) {
        return;
    }
    let now_hhmm = chrono::Local::now().format("%H:%M").to_string();
    if now_hhmm.as_str() < schedule.notify_time.as_str() {
        return;
    }

    let body = if schedule.titles.len() <= 3 {
        schedule.titles.join("、")
    } else {
        format!(
            "{} ほか{}件",
            schedule.titles[..3].join("、"),
            schedule.titles.len() - 3
        )
    };
    let result = app
        .notification()
        .builder()
        .title(format!("今日が期限のタスクが{}件あります", schedule.titles.len()))
        .body(&body)
        .show();
    if let Err(e) = result {
        // 通知失敗でもアプリは継続(設計書 §7)。次回 tick で再試行しない
        eprintln!("notification failed: {e}");
    }
    schedule.fired_date = Some(today.clone());
    let _ = app.emit("due-notified", today);
}

fn today_local() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}
