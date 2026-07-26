import { Tabs } from "radix-ui";

import { workspaceViewItems } from "./workspace-navigation";

/**
 * 窄屏下的工作台标签栏。
 *
 * 使用 Radix Tabs 原语：方向键切换、选中态与 `aria-controls` 到内容
 * 的关联都由原语提供。必须置于同一个 `Tabs.Root` 内才能与内容联动。
 */
export function MobileWorkspaceNav() {
  return (
    <nav
      aria-label="工作台视图"
      className="border-b border-stone-200/80 bg-[#f4f1eb]/90 px-5 pb-4 backdrop-blur sm:px-8 lg:hidden"
    >
      <Tabs.List
        aria-label="切换工作台视图"
        className="grid grid-cols-4 rounded-2xl border border-stone-200 bg-white p-1"
      >
        {workspaceViewItems.map((item) => (
          <Tabs.Trigger
            className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-medium text-stone-500 outline-none transition data-[state=active]:bg-stone-900 data-[state=active]:text-white focus-visible:ring-2 focus-visible:ring-stone-300"
            key={item.view}
            value={item.view}
          >
            <item.icon aria-hidden size={14} />
            <span className="truncate">{item.label}</span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </nav>
  );
}
