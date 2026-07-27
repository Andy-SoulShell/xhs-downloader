import { ArrowDownToLine } from "lucide-react";

export function ProductBrand({ compact = false }: { compact?: boolean }) {
  return (
    <a
      aria-label="XHS-DOWNLOADER 首页"
      className="flex items-center gap-3 rounded-2xl text-inherit"
      href="/"
    >
      <span
        className={`grid place-items-center rounded-xl bg-red-500 text-white ${
          compact ? "size-9" : "size-10 shadow-[0_8px_24px_rgba(239,68,68,0.25)]"
        }`}
      >
        <ArrowDownToLine aria-hidden size={compact ? 17 : 19} strokeWidth={2.25} />
      </span>
      <span className="whitespace-nowrap text-xs font-bold tracking-[0.04em]">XHS-DOWNLOADER</span>
    </a>
  );
}
