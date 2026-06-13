// DBパス切替の各モードが必要とするファイル操作(設計書 §4.1 / 仕様書 §7.3)。
// 純粋関数として切り出し、分岐をテスト可能にする(改善 #10)。

export type SwitchMode = "move" | "createNew" | "openExisting" | "overwrite";

export interface SwitchPlan {
  copyOldToNew: boolean; // 旧DB → 新パスへコピー
  removeExistingNew: boolean; // 新パスの既存DBを先に削除(上書き)
  deleteOldAfter: boolean; // 切替成功後に旧DBを削除(移動)
}

export function planSwitch(mode: SwitchMode): SwitchPlan {
  switch (mode) {
    case "move":
      return { copyOldToNew: true, removeExistingNew: false, deleteOldAfter: true };
    case "overwrite":
      return { copyOldToNew: true, removeExistingNew: true, deleteOldAfter: false };
    case "createNew":
    case "openExisting":
      // ファイル操作なし(load 時に作成 or 既存を開く)
      return { copyOldToNew: false, removeExistingNew: false, deleteOldAfter: false };
  }
}
