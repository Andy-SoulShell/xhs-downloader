/** 解析失败或页面未提供数量时，领域模型使用的哨兵值。 */
const UNKNOWN_SENTINEL = "-1";

/** 数量未知时展示的占位符。 */
export const UNKNOWN_METRIC_TEXT = "—";

/**
 * 把数量字段转换为可直接展示的文本。
 *
 * @param value 领域模型给出的数量字符串。
 * @returns 数量已知时返回原值，未知时返回占位符。
 */
export function formatMetricValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === UNKNOWN_SENTINEL) return UNKNOWN_METRIC_TEXT;
  return trimmed;
}

/**
 * 构造数量的无障碍名称。
 *
 * @param label 数量含义，例如“赞”。
 * @param value 领域模型给出的数量字符串。
 * @returns 数量未知时明确读出“未知”，而不是读出哨兵值。
 */
export function metricAriaLabel(label: string, value: string): string {
  const text = formatMetricValue(value);
  return text === UNKNOWN_METRIC_TEXT ? `${label}数量未知` : `${label} ${text}`;
}
