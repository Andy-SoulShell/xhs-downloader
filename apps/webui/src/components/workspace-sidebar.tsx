import { GalleryVerticalEnd } from "lucide-react";

import type { Filter, WorkspaceView } from "../lib/workspace";
import { ProductBrand } from "./product-brand";
import { StatusPill } from "./status-pill";
import { managementViewItems, postFilterItems } from "./workspace-navigation";

interface WorkspaceSidebarProps {
  activityCount: number;
  completedCount: number;
  filter: Filter;
  online: boolean | null;
  postCount: number;
  view: WorkspaceView;
  onFilterChange: (filter: Filter) => void;
  onViewChange: (view: WorkspaceView) => void;
}

export function WorkspaceSidebar({
  activityCount,
  completedCount,
  filter,
  online,
  postCount,
  view,
  onFilterChange,
  onViewChange,
}: WorkspaceSidebarProps) {
  const pendingCount = postCount - completedCount;
  const filterCounts: Record<Filter, number> = {
    all: postCount,
    ready: pendingCount,
    done: completedCount,
  };
  const viewCounts: Partial<Record<WorkspaceView, number>> = {
    activity: activityCount,
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-stone-800 bg-stone-950 px-4 py-5 text-white lg:flex">
      <div className="px-3 py-2">
        <ProductBrand />
      </div>

      <nav aria-label="我的帖子" className="mt-9 space-y-1">
        {postFilterItems.map((item) => (
          <SidebarButton
            active={view === "content" && filter === item.filter}
            count={filterCounts[item.filter]}
            icon={item.icon}
            key={item.filter}
            label={item.sidebarLabel}
            onClick={() => {
              onViewChange("content");
              onFilterChange(item.filter);
            }}
          />
        ))}
      </nav>

      <nav
        aria-label="工作台"
        className="mt-6 space-y-1 border-t border-stone-800 pt-6"
      >
        {managementViewItems.map((item) => (
          <SidebarButton
            active={view === item.view}
            count={viewCounts[item.view]}
            icon={item.icon}
            key={item.view}
            label={item.sidebarLabel}
            onClick={() => onViewChange(item.view)}
          />
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-stone-800 bg-stone-900 p-4">
        <p className="text-xs font-medium text-stone-300">本地服务</p>
        <div className="mt-3">
          <StatusPill online={online} />
        </div>
        <p className="mt-3 text-[11px] leading-5 text-stone-500">
          浏览和发布都用你自己的登录状态，软件不会读取你的账号密码。
        </p>
      </div>
    </aside>
  );
}

function SidebarButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  icon: typeof GalleryVerticalEnd;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
        active
          ? "bg-white text-stone-950"
          : "text-stone-400 hover:bg-stone-900 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden size={17} />
      <span className="flex-1 text-left font-medium">{label}</span>
      {count !== undefined && (
        <span className={active ? "text-stone-400" : "text-stone-600"}>
          {count}
        </span>
      )}
    </button>
  );
}
