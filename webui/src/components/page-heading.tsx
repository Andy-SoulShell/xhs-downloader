import type { ReactNode } from "react";

interface PageHeadingProps {
  actions?: ReactNode;
  description?: string;
  meta: string;
  title: string;
}

export function PageHeading({
  actions,
  description,
  meta,
  title,
}: PageHeadingProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-semibold tracking-[-0.035em] text-stone-950">
          <span>{title}</span>
          <span className="text-sm font-normal tracking-normal text-stone-500">
            {meta}
          </span>
        </h1>
        {description && (
          <p className="mt-2 text-sm text-stone-500">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
