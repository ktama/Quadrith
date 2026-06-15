// 複数選択(改善: 複数選択)の純粋ロジック。uiStore から利用する。

// id を選択集合に追加/除去してトグルした新しい配列を返す。
export function toggleSelected(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}
