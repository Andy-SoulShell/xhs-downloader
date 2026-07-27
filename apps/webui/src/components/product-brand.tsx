import { ArrowDownToLine } from "lucide-react";

/**
 * 产品标识。
 *
 * 不是链接：这里没有路由，`href="/"` 会把整个应用重新加载一遍，未保存的
 * 编辑、筛选和浏览结果全部归零——点一下标志就等于刷新页面。做成按钮也没
 * 有意义，它没有任何可去之处。
 */
export function ProductBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl text-inherit">
      <span
        className={`grid place-items-center rounded-xl bg-red-500 text-white ${
          compact ? "size-9" : "size-10 shadow-[0_8px_24px_rgba(239,68,68,0.25)]"
        }`}
      >
        <ArrowDownToLine aria-hidden size={compact ? 17 : 19} strokeWidth={2.25} />
      </span>
      <span className="whitespace-nowrap text-xs font-bold tracking-[0.04em]">XHS-DOWNLOADER</span>
    </div>
  );
}
