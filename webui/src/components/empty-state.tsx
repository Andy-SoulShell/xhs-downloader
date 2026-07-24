import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  description: string;
  icon: LucideIcon;
  title: string;
}

export function EmptyState({
  description,
  icon: Icon,
  title,
}: EmptyStateProps) {
  return (
    <div
      aria-label={title}
      className="grid min-h-[420px] place-items-center rounded-3xl border border-dashed border-stone-300 bg-white/45 p-8 text-center"
      role="status"
    >
      <div className="max-w-sm">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-50 text-red-500 ring-1 ring-red-100">
          <Icon aria-hidden size={22} />
        </span>
        <p className="mt-4 text-lg font-semibold text-stone-800">{title}</p>
        <p className="mt-2 text-sm leading-6 text-stone-500">{description}</p>
      </div>
    </div>
  );
}
