import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  description: string;
  icon: LucideIcon;
  title: string;
  action?: ReactNode;
  compact?: boolean;
}

/**
 * 内容为空时的占位。
 *
 * 不使用虚线边框和整屏留白：空状态本身不承载信息，占满视口只会让页面
 * 显得空洞。这里收紧高度、弱化图标，把注意力留给下一步操作。
 */
export function EmptyState({
  description,
  icon: Icon,
  title,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      aria-label={title}
      className={`flex flex-col items-center justify-center px-6 text-center ${
        compact ? "py-10" : "py-14"
      }`}
      role="status"
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-stone-100 text-stone-400">
        <Icon aria-hidden size={20} strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-sm font-semibold text-stone-700">{title}</p>
      <p className="mt-1.5 max-w-xs text-xs leading-6 text-stone-600">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
