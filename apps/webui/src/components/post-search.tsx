import { Search } from "lucide-react";

interface PostSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** 无障碍名称；默认按帖子列表。 */
  ariaLabel?: string;
  placeholder?: string;
  /** 输入框宽度类；默认宽屏定宽，嵌在窄栏里请传 `w-full`。 */
  className?: string;
}

/**
 * 列表的搜索框。
 *
 * 放在页头的操作位而不是列表上方：夹在粘贴卡片和网格之间会多出一条只装了
 * 一个输入框的横带，两张白底控件上下叠着，还把首条内容往下推。
 *
 * @param props 组件属性。
 * @param props.query 当前搜索词。
 * @param props.onQueryChange 搜索词变化时的回调。
 * @param props.ariaLabel 无障碍名称。
 * @param props.placeholder 占位文本。
 * @param props.className 额外的宽度或间距类。
 * @returns 搜索输入框。
 */
export function PostSearch({
  query,
  onQueryChange,
  ariaLabel = "搜索帖子",
  placeholder = "搜索标题或作者",
  className = "xl:w-64",
}: PostSearchProps) {
  return (
    <label
      className={`group flex h-11 w-full items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-stone-400 transition-all duration-200 focus-within:border-stone-400 focus-within:text-stone-600 focus-within:ring-4 focus-within:ring-stone-900/[0.06] ${className}`}
    >
      <Search aria-hidden size={16} />
      <input
        aria-label={ariaLabel}
        className="min-w-0 flex-1 bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-500"
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={query}
      />
    </label>
  );
}
