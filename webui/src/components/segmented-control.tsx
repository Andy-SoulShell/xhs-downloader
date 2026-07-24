import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ToggleGroup } from "radix-ui";

interface SegmentedControlProps {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  onValueChange: (value: string) => void;
  value: string;
}

export function SegmentedControl({
  ariaLabel,
  children,
  className = "",
  onValueChange,
  value,
}: SegmentedControlProps) {
  return (
    <ToggleGroup.Root
      aria-label={ariaLabel}
      className={`rounded-2xl border border-stone-200 bg-white p-1 ${className}`}
      onValueChange={(nextValue) => nextValue && onValueChange(nextValue)}
      type="single"
      value={value}
    >
      {children}
    </ToggleGroup.Root>
  );
}

export function SegmentedControlItem({
  children,
  icon: Icon,
  value,
  variant = "compact",
}: {
  children: ReactNode;
  icon?: LucideIcon;
  value: string;
  variant?: "compact" | "navigation";
}) {
  const variantClass =
    variant === "navigation"
      ? "gap-1.5 rounded-xl px-2 py-2.5 text-xs"
      : "rounded-lg px-3 py-2 text-xs";
  return (
    <ToggleGroup.Item
      className={`inline-flex min-w-0 items-center justify-center font-medium text-stone-500 outline-none transition data-[state=on]:bg-stone-900 data-[state=on]:text-white focus-visible:ring-2 focus-visible:ring-stone-300 ${variantClass}`}
      value={value}
    >
      {Icon && <Icon aria-hidden size={14} />}
      <span>{children}</span>
    </ToggleGroup.Item>
  );
}
