import { Check, Download as DownloadIcon } from "lucide-react";
import { Switch } from "radix-ui";

import type { PostRecord } from "../app";
import { mediaLabel, type MediaGroup } from "../lib/media";

interface PostDownloadSelectionProps {
  allSelected: boolean;
  media: MediaGroup[];
  post: PostRecord;
  onSelectionChange: (selected: Set<number>) => void;
}

export function PostDownloadSelection({
  allSelected,
  media,
  post,
  onSelectionChange,
}: PostDownloadSelectionProps) {
  const toggleMedia = (index: number, checked: boolean) => {
    const next = new Set(post.selected);
    if (checked) next.add(index);
    else next.delete(index);
    onSelectionChange(next);
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-900">选择下载项</h3>
        <button
          className="text-xs font-medium text-stone-500 hover:text-stone-950"
          onClick={() =>
            onSelectionChange(
              allSelected
                ? new Set()
                : new Set(media.map((item) => item.index)),
            )
          }
          type="button"
        >
          {allSelected ? "取消全选" : "选择全部"}
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {media.map((item) => {
          const selected = post.selected.has(item.index);
          const status = mediaStatus(post, item);
          return (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${
                selected
                  ? "border-red-200 bg-red-50/60"
                  : "border-stone-200 hover:border-stone-300"
              }`}
              key={item.index}
            >
              <span
                className={`grid size-5 shrink-0 place-items-center rounded-md border ${
                  selected
                    ? "border-red-500 bg-red-500 text-white"
                    : "border-stone-300 bg-white"
                }`}
              >
                {selected && <Check aria-hidden size={13} />}
              </span>
              <input
                aria-label={`选择第 ${item.index} 项`}
                checked={selected}
                className="sr-only"
                onChange={(event) =>
                  toggleMedia(item.index, event.target.checked)
                }
                type="checkbox"
              />
              <span className="min-w-0 flex-1 text-xs font-medium text-stone-700">
                第 {item.index} 项 · {mediaLabel(item)}
              </span>
              <span className={statusClass(status)}>{status}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function PostDownloadBar({
  onDownload,
  onForceChange,
  post,
}: {
  onDownload: () => void;
  onForceChange: (force: boolean) => void;
  post: PostRecord;
}) {
  return (
    <div className="border-t border-stone-200 bg-white p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-xs text-stone-500">
          <Switch.Root
            aria-label="强制重新下载"
            checked={post.force}
            className="relative h-5 w-9 rounded-full bg-stone-200 outline-none data-[state=checked]:bg-red-500 focus:ring-4 focus:ring-red-100"
            onCheckedChange={onForceChange}
          >
            <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
          强制重新下载
        </label>
        <button
          className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={post.status === "downloading" || post.selected.size === 0}
          onClick={onDownload}
          type="button"
        >
          <DownloadIcon aria-hidden size={16} />
          {post.status === "downloading"
            ? "正在下载…"
            : post.selected.size
              ? `下载 ${post.selected.size} 项`
              : "请选择媒体"}
        </button>
      </div>
    </div>
  );
}

function mediaStatus(post: PostRecord, group: MediaGroup): string {
  const selected = post.selected.has(group.index);
  if (post.status === "downloading" && selected) return "下载中";
  if (post.status === "error" && selected) return "失败";
  const downloaded = group.resources.some((item) =>
    post.downloaded.has(`${item.序号}:${item.类型}`),
  );
  return downloaded ? "已下载" : "未下载";
}

function statusClass(status: string): string {
  const color =
    status === "已下载"
      ? "bg-emerald-100 text-emerald-700"
      : status === "失败"
        ? "bg-red-100 text-red-600"
        : status === "下载中"
          ? "bg-amber-100 text-amber-700"
          : "bg-stone-100 text-stone-500";
  return `rounded-full px-2 py-1 text-[10px] font-medium ${color}`;
}
