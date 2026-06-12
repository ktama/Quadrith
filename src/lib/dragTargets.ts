// ドラッグのドロップ先判定に使う DOM 要素のレジストリ。
// MatrixView / InboxLane がマウント時に自身の要素を登録する。

export const dragTargets: {
  matrixEl: HTMLElement | null;
  inboxEl: HTMLElement | null;
} = {
  matrixEl: null,
  inboxEl: null,
};
