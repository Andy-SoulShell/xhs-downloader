import { Check, Download as DownloadIcon } from "lucide-react";
import { Switch } from "radix-ui";

import { mediaLabel, type MediaGroup } from "../lib/media";
import type { PostRecord } from "../lib/workspace";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { DownloadProgressBar } from "./download-progress-bar";

interface PostDownloadSelectionProps {
  activeIndex: number;
  allSelected: boolean;
  media: MediaGroup[];
  post: PostRecord;
  onPreviewChange: (position: number) => void;
  onSelectionChange: (selected: Set<number>) => void;
}

export function PostDownloadSelection({
  activeIndex,
  allSelected,
  media,
  post,
  onPreviewChange,
  onSelectionChange,
}: PostDownloadSelectionProps) {
  const toggleMedia = (index: number, checked: boolean) => {
    const next = new Set(post.selected);
    if (checked) next.add(index);
    else next.delete(index);
    onSelectionChange(next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-5 py-3 sm:px-7">
        <h3 className="text-sm font-semibold text-stone-900">选择下载项</h3>
        <button
          className="text-xs font-medium text-stone-600 hover:text-stone-950"
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
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-4 sm:px-7">
        {media.map((item, position) => {
          const selected = post.selected.has(item.index);
          const active = position === activeIndex;
          const status = mediaStatus(post, item);
          return (
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${
                active
                  ? "border-red-400 bg-red-50 ring-2 ring-red-100"
                  : selected
                    ? "border-red-100 bg-red-50/35"
                  : "border-stone-200 hover:border-stone-300"
              }`}
              key={item.index}
              onClick={() => onPreviewChange(position)}
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
              <Badge tone={statusTone(status)}>{status}</Badge>
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
  const failure = post.status === "error" ? post.result.message : "";
  return (
    <div className="border-t border-stone-200 bg-white p-4 sm:p-5">
      {post.status === "downloading" && post.progress && (
        <DownloadProgressBar progress={post.progress} />
      )}
      {/* 失败原因此前只存在记录里从不展示，用户只能看到一个红色的“失败”。 */}
      {failure && (
        <p className="notice-block mb-3 text-xs leading-5" role="alert">
          {failure}
        </p>
      )}
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-xs text-stone-600">
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
        <ActionButton
          className="h-auto min-w-36 rounded-xl py-3"
          disabled={post.status === "downloading" || post.selected.size === 0}
          onClick={onDownload}
          size="large"
        >
          <DownloadIcon aria-hidden size={16} />
          {post.status === "downloading"
            ? "正在下载…"
            : !post.selected.size
              ? "请选择媒体"
              : failure
                ? `重试下载 ${post.selected.size} 项`
                : `下载 ${post.selected.size} 项`}
        </ActionButton>
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

function statusTone(
  status: string,
): "success" | "danger" | "warning" | "neutral" {
  if (status === "已下载") return "success";
  if (status === "失败") return "danger";
  if (status === "下载中") return "warning";
  return "neutral";
}
