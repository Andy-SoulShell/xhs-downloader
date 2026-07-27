import { Link2, Plus } from "lucide-react";
import type { FormEvent } from "react";

import { ActionButton } from "./action-button";

interface LinkComposerProps {
  link: string;
  parsing: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export function LinkComposer({
  link,
  parsing,
  onChange,
  onSubmit,
}: LinkComposerProps) {
  return (
    <section aria-label="链接解析" className="control-shell p-3">
      {/* 窄屏也保持单行：堆成两行会多吃约 56px，把首条内容挤出首屏。 */}
      <form className="flex items-center gap-2 sm:gap-3" onSubmit={onSubmit}>
        <div className="group flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-stone-50 px-4 ring-1 ring-stone-200 transition-all duration-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-red-400/70 focus-within:ring-offset-0 focus-within:shadow-[0_0_0_4px_rgba(239,68,68,0.1)]">
          <Link2
            aria-hidden
            className="shrink-0 text-stone-400 transition-colors duration-200 group-focus-within:text-red-500"
            size={18}
          />
          <label className="min-w-0 flex-1" htmlFor="work-url">
            <span className="sr-only">帖子链接</span>
            <input
              aria-label="帖子链接"
              className="w-full bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
              id="work-url"
              onChange={(event) => onChange(event.target.value)}
              placeholder="粘贴小红书帖子链接"
              value={link}
            />
          </label>
        </div>
        <ActionButton
          className="shrink-0 disabled:cursor-wait"
          disabled={parsing}
          size="large"
          type="submit"
        >
          <Plus aria-hidden size={17} />
          {parsing ? (
            "正在解析…"
          ) : (
            // 必须裹成单个 flex 子项，否则按钮的 gap 会把“添加”和“到列表”拆开。
            <span>
              添加<span className="max-sm:sr-only">到列表</span>
            </span>
          )}
        </ActionButton>
      </form>
    </section>
  );
}
