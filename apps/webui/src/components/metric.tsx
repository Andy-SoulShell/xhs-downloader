import type { LucideIcon } from "lucide-react";

import { formatMetricValue, metricAriaLabel } from "../lib/metric-format";

interface MetricProps {
  icon: LucideIcon;
  label: string;
  value: string;
  compact?: boolean;
}

/**
 * 展示单项互动数量。
 *
 * @param props 组件属性。
 * @param props.icon 数量含义对应的图标。
 * @param props.label 数量含义，用于无障碍名称。
 * @param props.value 领域模型给出的数量字符串，未知时为哨兵值。
 * @param props.compact 是否用于卡片内的紧凑排布。
 * @returns 数量未知时显示占位符而非哨兵值的数量项。
 */
export function Metric({
  compact = false,
  icon: Icon,
  label,
  value,
}: MetricProps) {
  return (
    <span
      aria-label={metricAriaLabel(label, value)}
      className={`inline-flex items-center ${compact ? "gap-1" : "gap-1.5 text-stone-500"}`}
    >
      <Icon aria-hidden size={compact ? 13 : 15} />
      <span className={compact ? "" : "text-xs font-medium text-stone-700"}>
        {formatMetricValue(value)}
      </span>
    </span>
  );
}
