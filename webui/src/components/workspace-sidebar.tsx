import {
  ArrowDownToLine,
  CheckCircle2,
  CircleDashed,
  GalleryVerticalEnd,
} from "lucide-react";

import type { Filter } from "../app";
import { StatusPill } from "./status-pill";

interface WorkspaceSidebarProps {
  completedCount: number;
  filter: Filter;
  online: boolean | null;
  postCount: number;
  onFilterChange: (filter: Filter) => void;
}

export function WorkspaceSidebar({
  completedCount,
  filter,
  online,
  postCount,
  onFilterChange,
}: WorkspaceSidebarProps) {
  const pendingCount = postCount - completedCount;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-stone-800 bg-stone-950 px-4 py-5 text-white lg:flex">
      <a
        aria-label="xhs-downloader 首页"
        className="flex items-center gap-3 rounded-2xl px-3 py-2"
        href="/"
      >
        <span className="grid size-10 place-items-center rounded-xl bg-red-500 text-white shadow-[0_8px_24px_rgba(239,68,68,0.25)]">
          <ArrowDownToLine aria-hidden size={19} strokeWidth={2.25} />
        </span>
        <p className="whitespace-nowrap text-xs font-bold tracking-[0.02em]">
          XHS-DOWNLOADER
        </p>
      </a>

      <nav aria-label="帖子状态" className="mt-9 space-y-1">
        <SidebarButton
          active={filter === "all"}
          count={postCount}
          icon={GalleryVerticalEnd}
          label="全部帖子"
          onClick={() => onFilterChange("all")}
        />
        <SidebarButton
          active={filter === "ready"}
          count={pendingCount}
          icon={CircleDashed}
          label="待处理"
          onClick={() => onFilterChange("ready")}
        />
        <SidebarButton
          active={filter === "done"}
          count={completedCount}
          icon={CheckCircle2}
          label="已下载"
          onClick={() => onFilterChange("done")}
        />
      </nav>

      <div className="mt-auto rounded-2xl border border-stone-800 bg-stone-900 p-4">
        <p className="text-xs font-medium text-stone-300">服务状态</p>
        <div className="mt-3">
          <StatusPill online={online} />
        </div>
        <p className="mt-3 text-[11px] leading-5 text-stone-500">
          Cookie、代理与保存目录均由服务端配置管理。
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
  count: number;
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
      <span className={active ? "text-stone-400" : "text-stone-600"}>
        {count}
      </span>
    </button>
  );
}
