import type { LucideIcon } from "lucide-react";
import type { HTMLAttributes } from "react";

type BadgeTone =
  "accent" | "danger" | "dark" | "neutral" | "overlay" | "success" | "surface" | "warning";
type BadgeSize = "compact" | "regular" | "floating";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: LucideIcon;
  spinning?: boolean;
  size?: BadgeSize;
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  accent: "bg-red-50 text-red-600",
  danger: "bg-red-50 text-red-600",
  dark: "bg-stone-900 text-white",
  neutral: "bg-stone-100 text-stone-600",
  overlay: "bg-stone-950/75 text-white backdrop-blur",
  success: "bg-emerald-50 text-emerald-700",
  surface: "bg-white/92 text-stone-600 backdrop-blur",
  warning: "bg-amber-50 text-amber-700",
};

const sizeClasses: Record<BadgeSize, string> = {
  compact: "px-2 py-0.5 text-[10px]",
  regular: "px-2.5 py-1 text-[11px]",
  floating: "px-2.5 py-1.5 text-[10px] shadow-sm",
};

export function Badge({
  children,
  className = "",
  icon: Icon,
  size = "compact",
  spinning = false,
  tone = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${toneClasses[tone]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon aria-hidden className={spinning ? "animate-spin" : ""} size={12} />}
      {children}
    </span>
  );
}
