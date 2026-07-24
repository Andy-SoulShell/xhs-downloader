import type { LucideIcon } from "lucide-react";

interface MetricProps {
  icon: LucideIcon;
  label: string;
  value: string;
  compact?: boolean;
}

export function Metric({
  compact = false,
  icon: Icon,
  label,
  value,
}: MetricProps) {
  return (
    <span
      aria-label={`${label} ${value}`}
      className={`inline-flex items-center ${compact ? "gap-1" : "gap-1.5 text-stone-500"}`}
    >
      <Icon aria-hidden size={compact ? 13 : 15} />
      <span className={compact ? "" : "text-xs font-medium text-stone-700"}>
        {value}
      </span>
    </span>
  );
}
