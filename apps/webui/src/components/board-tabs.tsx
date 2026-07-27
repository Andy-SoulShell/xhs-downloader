import type { LucideIcon } from "lucide-react";
import { Tabs } from "radix-ui";
import { useState, type ReactNode } from "react";

/** 工作台内的一个分区。 */
export interface BoardTab {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** 该分区当前的条目数；为空表示不适合计数。 */
  count?: number;
  content: ReactNode;
}

interface BoardTabsProps {
  ariaLabel: string;
  tabs: BoardTab[];
  /** 初始分区；省略时停在第一个。传了 `value` 时无效。 */
  defaultValue?: string;
  /** 当前分区；传了就由外部掌控，供"提交后跳到任务列表"一类联动使用。 */
  value?: string;
  /** 切换分区时的回调，供页头一类标签条之外的位置跟着当前分区变化。 */
  onValueChange?: (value: string) => void;
}

/**
 * 工作台内部的分区标签。
 *
 * 把语义不同的内容分开呈现，避免不相关的区块串成一页长滚动。标签条按
 * 内容宽度收缩而不是横跨整行，否则右侧会留下大片与内容无关的空白。
 * 与顶层工作台标签使用各自独立的 `Tabs.Root`，互不影响。
 */
export function BoardTabs({
  ariaLabel,
  tabs,
  defaultValue,
  value: controlledValue,
  onValueChange,
}: BoardTabsProps) {
  const [ownValue, setOwnValue] = useState(defaultValue ?? tabs[0]?.value ?? "");
  const value = controlledValue ?? ownValue;

  if (tabs.length <= 1) {
    return <>{tabs[0]?.content}</>;
  }

  const selectTab = (next: string) => {
    setOwnValue(next);
    onValueChange?.(next);
  };

  return (
    <Tabs.Root onValueChange={selectTab} value={value}>
      <Tabs.List
        aria-label={ariaLabel}
        className="inline-flex max-w-full flex-wrap gap-0.5 rounded-2xl bg-stone-950/[0.04] p-1"
      >
        {tabs.map((tab) => {
          const active = value === tab.value;
          return (
            <Tabs.Trigger
              className="group inline-flex min-w-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-stone-600 outline-none transition-all duration-200 hover:text-stone-900 data-[state=active]:bg-white data-[state=active]:text-stone-950 data-[state=active]:shadow-[0_1px_2px_rgb(28_25_23/0.08),0_4px_12px_rgb(28_25_23/0.06)] focus-visible:ring-2 focus-visible:ring-stone-900/15"
              key={tab.value}
              value={tab.value}
            >
              {tab.icon && (
                <tab.icon
                  aria-hidden
                  className="shrink-0 transition-colors"
                  size={15}
                  strokeWidth={active ? 2.25 : 1.75}
                />
              )}
              <span className="truncate">{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`ml-0.5 min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] leading-4 font-semibold tabular-nums transition-colors ${
                    active ? "bg-stone-900 text-white" : "bg-stone-900/[0.06] text-stone-600"
                  }`}
                >
                  {tab.count > 99 ? "99+" : tab.count}
                </span>
              )}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>

      {tabs.map((tab) => (
        <Tabs.Content
          className="mt-5 outline-none data-[state=active]:animate-[board-tab-in_220ms_cubic-bezier(0.16,1,0.3,1)]"
          key={tab.value}
          value={tab.value}
        >
          {tab.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
