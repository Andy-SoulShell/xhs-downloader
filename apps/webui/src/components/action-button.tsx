import type { ButtonHTMLAttributes } from "react";

type ActionButtonVariant = "primary" | "outline" | "ghost";
type ActionButtonSize = "medium" | "large" | "icon";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ActionButtonSize;
  variant?: ActionButtonVariant;
}

const variantClasses: Record<ActionButtonVariant, string> = {
  primary:
    "bg-red-500 text-white shadow-[0_8px_20px_rgba(239,68,68,0.18)] hover:bg-red-600 hover:shadow-[0_10px_24px_rgba(239,68,68,0.24)] focus-visible:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
  outline:
    "border border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50 focus-visible:ring-stone-900/15 disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "text-stone-500 hover:bg-stone-100 hover:text-stone-950 focus-visible:ring-stone-900/15 disabled:cursor-not-allowed disabled:opacity-50",
};

const sizeClasses: Record<ActionButtonSize, string> = {
  medium: "h-9 rounded-xl px-3 text-xs",
  large: "h-12 rounded-2xl px-5 text-sm",
  icon: "size-9 rounded-full",
};

export function ActionButton({
  className = "",
  size = "medium",
  type = "button",
  variant = "primary",
  ...props
}: ActionButtonProps) {
  return (
    <button
      // 轻微下压给出触感反馈；焦点环用于键盘操作，鼠标点击时不出现。
      className={`inline-flex shrink-0 items-center justify-center gap-2 font-semibold outline-none transition-all duration-150 not-disabled:active:scale-[0.97] focus-visible:ring-4 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      type={type}
      {...props}
    />
  );
}
