import { GalleryVerticalEnd } from "lucide-react";
import { Tabs } from "radix-ui";

import type { Filter, WorkspaceView } from "../lib/workspace";
import { ProductBrand } from "./product-brand";
import { StatusPill } from "./status-pill";
import { postFilterItems, workspaceViewItems } from "./workspace-navigation";

interface WorkspaceSidebarProps {
  activityCount: number;
  completedCount: number;
  filter: Filter;
  online: boolean | null;
  postCount: number;
  /** 等着用户处理的发布任务数。 */
  publicationCount: number;
  view: WorkspaceView;
  onFilterChange: (filter: Filter) => void;
}

export function WorkspaceSidebar({
  activityCount,
  completedCount,
  filter,
  online,
  postCount,
  publicationCount,
  view,
  onFilterChange,
}: WorkspaceSidebarProps) {
  const pendingCount = postCount - completedCount;
  const filterCounts: Record<Filter, number> = {
    all: postCount,
    ready: pendingCount,
    done: completedCount,
  };
  // 发布只在有事等着人做时才亮角标：把任务总数常年挂在那里，
  // 用户很快就学会不看它，真正需要处理的那次也一起被忽略。
  const viewCounts: Partial<Record<WorkspaceView, { count: number; urgent?: boolean }>> = {
    activity: { count: activityCount },
    ...(publicationCount ? { publication: { count: publicationCount, urgent: true } } : {}),
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-stone-800 bg-stone-950 px-4 py-5 text-white lg:flex">
      <div className="px-3 py-2">
        <ProductBrand />
      </div>

      {/* 四个工作台必须都在这一组里。此前"内容"由上方三个筛选按钮代劳，
          没有对应的 Trigger，导致漫游 tabindex 无处落脚、内容面板的
          aria-labelledby 指向不存在的元素，键盘也永远走不进主内容区。 */}
      <Tabs.List aria-label="工作台" className="mt-9 space-y-1">
        {workspaceViewItems.map((item) => {
          const badge = viewCounts[item.view];
          return (
            <Tabs.Trigger
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-stone-400 outline-none transition hover:bg-stone-900 hover:text-white data-[state=active]:bg-white data-[state=active]:text-stone-950 focus-visible:ring-2 focus-visible:ring-stone-600"
              key={item.view}
              value={item.view}
            >
              <item.icon aria-hidden size={17} />
              <span className="flex-1 text-left font-medium">{item.sidebarLabel}</span>
              {badge && (
                <span
                  aria-label={badge.urgent ? `${badge.count} 项等你处理` : undefined}
                  className={
                    badge.urgent
                      ? "min-w-5 rounded-full bg-amber-400 px-1.5 text-center text-[11px] leading-5 font-semibold text-stone-950"
                      : "text-stone-400"
                  }
                >
                  {badge.count}
                </span>
              )}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>

      {/* 筛选是内容工作台内部的事，切到其它工作台就不该继续占位。 */}
      {view === "content" && (
        <nav aria-label="帖子筛选" className="mt-4 space-y-1 border-t border-stone-800 pt-4">
          {postFilterItems.map((item) => (
            <SidebarButton
              active={filter === item.filter}
              count={filterCounts[item.filter]}
              icon={item.icon}
              key={item.filter}
              label={item.sidebarLabel}
              onClick={() => onFilterChange(item.filter)}
            />
          ))}
        </nav>
      )}

      <div className="mt-auto rounded-2xl border border-stone-800 bg-stone-900 p-4">
        <p className="text-xs font-medium text-stone-300">本地服务</p>
        <div className="mt-3">
          <StatusPill online={online} />
        </div>
        <p className="mt-3 text-[11px] leading-5 text-stone-400">
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
        active ? "bg-white text-stone-950" : "text-stone-400 hover:bg-stone-900 hover:text-white"
      }`}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden size={17} />
      <span className="flex-1 text-left font-medium">{label}</span>
      {count !== undefined && (
        <span className={active ? "text-stone-500" : "text-stone-400"}>{count}</span>
      )}
    </button>
  );
}
