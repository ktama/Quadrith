// 任意パスのファイル I/O(設計書 §1: ファイル操作は OS 連携として Rust 側で扱う)。
// DB はユーザーが任意の場所(Dropbox 等、仕様書 §7.4)に置けるため、appdata に
// スコープが限定される plugin-fs ではなく std::fs で行う。
// バックアップ・DBパス切替・エクスポートがこれらを共用する。

#[tauri::command]
pub fn save_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
pub fn fs_make_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_copy_file(from: String, to: String) -> Result<(), String> {
    std::fs::copy(&from, &to)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_remove_file(path: String) -> Result<(), String> {
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        // 存在しないファイルの削除は成功扱い(冪等にする)
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// 指定ディレクトリ直下のファイル名一覧(ディレクトリは除く)。存在しなければ空。
#[tauri::command]
pub fn fs_list_dir(path: String) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    match std::fs::read_dir(&path) {
        Ok(entries) => {
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    names.push(entry.file_name().to_string_lossy().to_string());
                }
            }
            Ok(names)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(names),
        Err(e) => Err(e.to_string()),
    }
}
