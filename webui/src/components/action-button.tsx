import type { ButtonHTMLAttributes } from "react";

type ActionButtonVariant = "primary" | "outline" | "ghost";
type ActionButtonSize = "medium" | "large" | "icon";

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: ActionButtonSize;
  variant?: ActionButtonVariant;
}

const variantClasses: Record<ActionButtonVariant, string> = {
  primary:
    "bg-red-500 text-white shadow-[0_8px_20px_rgba(239,68,68,0.18)] hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50",
  outline:
    "border border-stone-200 bg-white text-stone-700 hover:border-stone-400 disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "text-stone-500 hover:bg-stone-100 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-50",
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
      className={`inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      type={type}
      {...props}
    />
  );
}
