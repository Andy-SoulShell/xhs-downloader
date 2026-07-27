import { Search } from "lucide-react";

interface PostSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
}

/**
 * 帖子列表的搜索框。
 *
 * 放在页头的操作位而不是列表上方：夹在粘贴卡片和网格之间会多出一条只装了
 * 一个输入框的横带，两张白底控件上下叠着，还把首条内容往下推。
 *
 * @param props 组件属性。
 * @param props.query 当前搜索词。
 * @param props.onQueryChange 搜索词变化时的回调。
 * @returns 页头右侧的搜索输入框。
 */
export function PostSearch({ query, onQueryChange }: PostSearchProps) {
  return (
    <label className="group flex h-11 w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-stone-400 transition-all duration-200 focus-within:border-stone-400 focus-within:text-stone-600 focus-within:ring-4 focus-within:ring-stone-900/[0.06] xl:w-64">
      <Search aria-hidden size={16} />
      <input
        aria-label="搜索帖子"
        className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-500"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="搜索标题或作者"
        type="search"
        value={query}
      />
    </label>
  );
}
