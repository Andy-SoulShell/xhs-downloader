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
  /** 初始分区；省略时停在第一个。 */
  defaultValue?: string;
}

/**
 * 工作台内部的分区标签。
 *
 * 把语义不同的内容分开呈现，避免把不相关的区块串成一页长滚动。
 * 与顶层工作台标签使用各自独立的 `Tabs.Root`，互不影响。
 */
export function BoardTabs({ ariaLabel, tabs, defaultValue }: BoardTabsProps) {
  const [value, setValue] = useState(defaultValue ?? tabs[0]?.value ?? "");

  if (tabs.length <= 1) {
    return <>{tabs[0]?.content}</>;
  }

  return (
    <Tabs.Root onValueChange={setValue} value={value}>
      <Tabs.List
        aria-label={ariaLabel}
        className="mt-6 flex min-w-0 flex-wrap gap-1 rounded-2xl border border-stone-200 bg-white p-1"
      >
        {tabs.map((tab) => (
          <Tabs.Trigger
            className="inline-flex min-w-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-500 outline-none transition data-[state=active]:bg-stone-900 data-[state=active]:text-white focus-visible:ring-2 focus-visible:ring-stone-300"
            key={tab.value}
            value={tab.value}
          >
            {tab.icon && <tab.icon aria-hidden size={15} />}
            <span className="truncate">{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={
                  value === tab.value ? "text-stone-400" : "text-stone-400"
                }
              >
                {tab.count}
              </span>
            )}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {tabs.map((tab) => (
        <Tabs.Content key={tab.value} value={tab.value}>
          {tab.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
