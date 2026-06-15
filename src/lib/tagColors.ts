// タグ色のパレットと文字色判定(改善: タグ色選択)。
// 純粋関数のみ。Tag.color は引き続き HEX 文字列で保存する。

// 色相を一周する 10 色。アクセント(インディゴ #6366f1)系は避け、
// ステータス 5 色(ユーザー設定)と意味が衝突しないタグ専用パレット。
export const TAG_PALETTE: readonly string[] = [
  "#ef4444", // 赤
  "#f97316", // 橙
  "#eab308", // 黄
  "#84cc16", // ライム
  "#22c55e", // 緑
  "#14b8a6", // ティール
  "#3b82f6", // 青
  "#8b5cf6", // 紫
  "#ec4899", // ピンク
  "#64748b", // グレー
] as const;

export const DEFAULT_TAG_COLOR = TAG_PALETTE[0];

// "#rgb" / "#rrggbb" を [r,g,b] (0-255) に。不正値は null。
function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// 知覚輝度 (YIQ, 0=黒 .. 1=白)。WCAG 相対輝度より人の見た目に近く、
// 文字色の黒/白判定に適する。不正値は 0(黒)扱い。
export function perceivedBrightness(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return (r * 299 + g * 587 + b * 114) / 255000;
}

// 背景色の上に乗せて読みやすい文字色(白 or 黒)。
// しきい値 0.5(YIQ 128/255 相当)で黄・ライム等は黒、赤・青等は白になる。
export function readableTextColor(hex: string): "#ffffff" | "#000000" {
  return perceivedBrightness(hex) > 0.5 ? "#000000" : "#ffffff";
}
