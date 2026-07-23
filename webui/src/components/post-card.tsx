import { useState } from "react";
import { Switch } from "radix-ui";

import type { PostRecord } from "../app";
import { MediaPreview } from "./media-preview";
import { MediaViewer } from "./media-viewer";

interface PostCardProps {
  post: PostRecord;
  onSelectionChange: (selected: Set<number>) => void;
  onForceChange: (force: boolean) => void;
  onDownload: () => void;
  onRemove: () => void;
}

const formatTime = (value: string | null) => {
  if (!value) return "发布时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export function PostCard({
  post,
  onSelectionChange,
  onForceChange,
  onDownload,
  onRemove,
}: PostCardProps) {
  const [activeMedia, setActiveMedia] = useState<number | null>(null);
  const detail = post.result.data;
  if (!detail) return null;

  const mediaGroups = [...new Set(detail.媒体.map((item) => item.序号))].map(
    (index) => {
      const resources = detail.媒体.filter((item) => item.序号 === index);
      const preview =
        resources.find((item) => item.类型 === "图片") ??
        resources.find((item) => item.类型 === "视频") ??
        resources[0];
      return {
        index,
        resources,
        preview,
      };
    },
  );
  const mediaIndexes = mediaGroups.map((group) => group.index);
  const allSelected =
    mediaIndexes.length > 0 &&
    mediaIndexes.every((index) => post.selected.has(index));

  const toggleMedia = (index: number, checked: boolean) => {
    const next = new Set(post.selected);
    if (checked) next.add(index);
    else next.delete(index);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    onSelectionChange(allSelected ? new Set() : new Set(mediaIndexes));
  };

  return (
    <article className="post-card overflow-hidden">
      <div className="p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full bg-stone-900 text-sm font-semibold text-white"
            >
              {detail.作者.作者昵称.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-900">
                {detail.作者.作者昵称}
              </p>
              <p className="mt-0.5 text-xs text-stone-400">
                {formatTime(detail.发布时间)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              aria-label={`移除帖子：${detail.作品标题}`}
              className="rounded-lg px-2 py-1 text-xs text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              onClick={onRemove}
              type="button"
            >
              移除
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-stone-900 px-2.5 py-1 text-[11px] font-medium text-white">
              {detail.作品类型}
            </span>
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600">
              {mediaIndexes.length} 组媒体
            </span>
          </div>
          <h2 className="mt-4 text-xl leading-snug font-semibold tracking-tight text-stone-950 sm:text-2xl">
            {detail.作品标题 || "未命名帖子"}
          </h2>
          <p className="mt-3 line-clamp-3 text-sm leading-6 text-stone-600">
            {detail.作品描述 || "这个帖子没有文字描述。"}
          </p>
          {detail.作品标签.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-2 gap-y-1">
              {detail.作品标签.slice(0, 8).map((tag) => (
                <span className="text-xs text-stone-400" key={tag}>
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-y border-stone-100 py-3 text-xs text-stone-500">
          <span>{detail.点赞数量} 赞</span>
          <span>{detail.收藏数量} 收藏</span>
          <span>{detail.评论数量} 评论</span>
          <span>{detail.分享数量} 分享</span>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold tracking-[0.12em] text-stone-500 uppercase">
              选择要下载的媒体
            </p>
            <button
              className="text-xs font-medium text-stone-500 hover:text-stone-900"
              onClick={toggleAll}
              type="button"
            >
              {allSelected ? "取消全选" : "选择全部"}
            </button>
          </div>
          <div className="media-masonry mt-3">
            {mediaGroups.map((media, position) => {
              const selected = post.selected.has(media.index);
              const downloaded = media.resources.some((resource) =>
                post.downloaded.has(`${resource.序号}:${resource.类型}`),
              );
              const status =
                post.status === "downloading" && selected
                  ? "下载中"
                  : post.status === "error" && selected
                    ? "下载失败"
                    : downloaded
                      ? "已下载"
                      : "未下载";
              return (
                <div
                  className={`media-tile group overflow-hidden rounded-2xl border bg-stone-50 transition ${
                    selected
                      ? "border-red-400 ring-2 ring-red-100"
                      : "border-stone-200 hover:border-stone-400"
                  }`}
                  data-status={status}
                  key={media.index}
                >
                  <div className="relative overflow-hidden bg-stone-200">
                    <MediaPreview
                      index={media.index}
                      onOpen={() => setActiveMedia(position)}
                      resources={media.resources}
                      title={detail.作品标题 || "帖子"}
                    />
                    <label className="absolute top-2.5 left-2.5 z-10 flex cursor-pointer items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1.5 text-[10px] font-medium text-stone-700 shadow-sm backdrop-blur">
                      <input
                        aria-label={`选择第 ${media.index} 项`}
                      checked={selected}
                        className="size-3.5 cursor-pointer accent-red-500"
                        onChange={(event) =>
                          toggleMedia(media.index, event.target.checked)
                      }
                        type="checkbox"
                      />
                      <span>
                        {selected
                          ? `已选第 ${media.index} 项`
                          : `选择第 ${media.index} 项`}
                      </span>
                    </label>
                    <span
                      className={`absolute top-2.5 right-2.5 z-10 rounded-full px-2 py-1 text-[10px] font-medium shadow-sm backdrop-blur ${
                        status === "已下载"
                          ? "bg-emerald-50/95 text-emerald-700"
                          : status === "下载失败"
                            ? "bg-red-50/95 text-red-600"
                            : status === "下载中"
                              ? "bg-amber-50/95 text-amber-700"
                              : "bg-white/90 text-stone-500"
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-stone-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center justify-between gap-3 px-1 text-xs text-stone-500">
            强制重新下载
            <Switch.Root
              aria-label="强制重新下载"
              checked={post.force}
              className="relative h-5 w-9 rounded-full bg-stone-200 outline-none data-[state=checked]:bg-red-500 focus:ring-4 focus:ring-red-100"
              onCheckedChange={onForceChange}
            >
              <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
            </Switch.Root>
          </label>
          <button
            className="rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600 disabled:cursor-wait disabled:opacity-60"
            disabled={post.status === "downloading" || post.selected.size === 0}
            onClick={onDownload}
            type="button"
          >
            {post.status === "downloading"
              ? "正在下载…"
              : post.selected.size
                ? `下载已选 ${post.selected.size} 组`
                : "请选择媒体"}
          </button>
        </div>
      </div>
      {activeMedia !== null && (
        <MediaViewer
          activeIndex={activeMedia}
          media={mediaGroups}
          onIndexChange={setActiveMedia}
          onOpenChange={(open) => {
            if (!open) setActiveMedia(null);
          }}
          open
        />
      )}
    </article>
  );
}
