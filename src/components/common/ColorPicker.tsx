// タグ色選択(改善: タグ色選択)。パレットのスウォッチをワンクリック選択。
// 末尾「カスタム」で従来の OS カラーダイアログ(<input type="color">)も開ける。

import { useId } from "react";
import { TAG_PALETTE } from "../../lib/tagColors";

interface Props {
  value: string;
  onChange: (color: string) => void;
  /** スクリーンリーダ向けの対象名(例: タグ名)。 */
  label?: string;
}

export function ColorPicker({ value, onChange, label }: Props) {
  const customId = useId();
  const isPreset = TAG_PALETTE.some((c) => c.toLowerCase() === value.toLowerCase());
  const suffix = label ? `(${label})` : "";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {TAG_PALETTE.map((color) => {
        const selected = color.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            aria-label={`色 ${color}${suffix}`}
            aria-pressed={selected}
            className={`w-5 h-5 rounded-full border transition-shadow ${
              selected
                ? "ring-2 ring-offset-1 ring-slate-500 dark:ring-offset-slate-800 border-transparent"
                : "border-black/10 dark:border-white/20"
            }`}
            style={{ background: color }}
            onClick={() => onChange(color)}
          />
        );
      })}
      {/* カスタム色: 従来の OS ピッカー。パレット外の色は選択中として枠を強調。 */}
      <label
        htmlFor={customId}
        title="カスタム色"
        className={`relative w-5 h-5 rounded-full border cursor-pointer overflow-hidden ${
          !isPreset
            ? "ring-2 ring-offset-1 ring-slate-500 dark:ring-offset-slate-800 border-transparent"
            : "border-black/10 dark:border-white/20"
        }`}
        style={{
          background:
            "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)",
        }}
      >
        <input
          id={customId}
          type="color"
          aria-label={`カスタム色${suffix}`}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
