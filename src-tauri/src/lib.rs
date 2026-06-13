// Rust 側は OS 連携のみに徹し、ロジックは TS 側に寄せる(設計書 §1)。
// 担当: プラグイン登録 / システムトレイ / 通知スケジューラ(scheduler.rs)
// グローバルショートカットの登録と「閉じる→トレイ」の制御は TS 側から行う。
// マイグレーションは任意の DB パスに追従させるため TS 側で実行する
// (src/lib/migrations.ts を参照。PRAGMA user_version で管理)。

mod scheduler;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

// エクスポート用のファイル書込(設計書 §1: ファイル I/O は OS 連携として Rust 側で扱う)。
// 保存先はダイアログでユーザーが選んだ任意パスのため、appdata に限定される
// plugin-fs ではなく std::fs で書き込む。
#[tauri::command]
fn save_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "開く", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Quadrith")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(scheduler::SchedulerState::default())
        .invoke_handler(tauri::generate_handler![
            scheduler::schedule_notifications,
            save_text_file
        ])
        .setup(|app| {
            setup_tray(app)?;
            scheduler::start(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
