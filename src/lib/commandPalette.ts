// コマンドパレット(改善: Ctrl+K)の純粋ロジック。
// コマンド定義は呼び出し側(コンポーネント)がストアを束ねて生成し、
// ここでは「クエリによる絞り込み・並べ替え」だけを担う(vitest でテスト可能)。

export interface Command {
  id: string;
  title: string;
  // 補足表示(右側のヒントなど)
  hint?: string;
  // タイトルに出ない検索語(英名・別名など)
  keywords?: string;
  run: () => void;
}

// クエリ各文字を text の部分列として順に拾えるか判定し、スコアを返す。
// 見つからなければ null。スコアは小さいほど良い(先頭一致・連続一致を優遇)。
export function matchScore(text: string, query: string): number | null {
  if (query === "") return 0;
  const t = text.toLowerCase();
  const q = query.toLowerCase();

  let ti = 0;
  let score = 0;
  let prevIndex = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    // 先頭からの距離 + 直前一致からの飛び(連続なら 0)を加点
    score += found + (prevIndex === -1 ? 0 : found - prevIndex - 1);
    prevIndex = found;
    ti = found + 1;
  }
  return score;
}

// コマンド群をクエリで絞り込み、スコア昇順(同点は元の順序)で返す。
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim();
  if (q === "") return commands;
  const scored: { cmd: Command; score: number; idx: number }[] = [];
  commands.forEach((cmd, idx) => {
    const haystack = cmd.keywords ? `${cmd.title} ${cmd.keywords}` : cmd.title;
    const score = matchScore(haystack, q);
    if (score !== null) scored.push({ cmd, score, idx });
  });
  scored.sort((a, b) => a.score - b.score || a.idx - b.idx);
  return scored.map((s) => s.cmd);
}
