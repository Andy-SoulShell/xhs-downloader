interface CharacterCountProps {
  value: number;
  limit: number;
}

/**
 * 字数指示。
 *
 * 输入框有长度上限却不显示进度时，用户只会在打字被截断时才发现。
 * 接近上限才转为警示色，平时保持安静。
 */
export function CharacterCount({ value, limit }: CharacterCountProps) {
  const nearLimit = value >= limit * 0.9;
  return (
    <p
      className={`mt-1.5 text-right text-[11px] leading-4 tabular-nums transition-colors ${
        nearLimit ? "text-amber-600" : "text-stone-400"
      }`}
    >
      {value}/{limit}
    </p>
  );
}
