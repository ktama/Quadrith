// 任意パスのファイル I/O(Rust の fsops コマンドのラッパ)。
// DB は任意の場所(仕様書 §7.4)に置けるため、appdata 限定の plugin-fs ではなく
// これらを使う。バックアップ / DBパス切替 / エクスポートが共用する。

import { invoke } from "@tauri-apps/api/core";

export const fsExists = (path: string) => invoke<boolean>("fs_exists", { path });
export const fsMakeDir = (path: string) => invoke<void>("fs_make_dir", { path });
export const fsCopyFile = (from: string, to: string) =>
  invoke<void>("fs_copy_file", { from, to });
export const fsRemoveFile = (path: string) => invoke<void>("fs_remove_file", { path });
export const fsListDir = (path: string) => invoke<string[]>("fs_list_dir", { path });
export const saveTextFile = (path: string, contents: string) =>
  invoke<void>("save_text_file", { path, contents });
