// Rust 側は OS 連携のみに徹し、ロジックは TS 側に寄せる(設計書 §1)。
// MVP で使うプラグイン: sql(SQLite)/ store(settings.json)/ fs(起動時バックアップ)
// マイグレーションは任意の DB パスに追従させるため TS 側で実行する
// (src/lib/migrations.ts を参照。PRAGMA user_version で管理)。
// トレイ・グローバルショートカット・通知はフェーズ2で追加する。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
