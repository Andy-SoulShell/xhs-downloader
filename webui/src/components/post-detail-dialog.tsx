import { useMemo, useState } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";

import type { PostRecord } from "../app";
import { groupMedia } from "../lib/media";
import { AuthorAvatar } from "./author-avatar";
import { MediaStage } from "./media-stage";
import {
  PostDownloadBar,
  PostDownloadSelection,
} from "./post-download-controls";

interface PostDetailDialogProps {
  open: boolean;
  post: PostRecord;
  onDownload: () => void;
  onForceChange: (force: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  onSelectionChange: (selected: Set<number>) => void;
}

export function PostDetailDialog({
  open,
  post,
  onDownload,
  onForceChange,
  onOpenChange,
  onRemove,
  onSelectionChange,
}: PostDetailDialogProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const detail = post.result.data;
  const media = useMemo(
    () => groupMedia(detail?.媒体 ?? []),
    [detail?.媒体],
  );

  if (!detail || !media.length) return null;
  const visibleIndex = Math.min(activeIndex, media.length - 1);
  const current = media[visibleIndex];
  const allSelected = media.every((item) => post.selected.has(item.index));
  const move = (step: number) => {
    setActiveIndex((position) => (position + step + media.length) % media.length);
  };
  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setActiveIndex(0);
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/55 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 grid h-[min(94vh,880px)] w-[min(96vw,1120px)] -translate-x-1/2 -translate-y-1/2 grid-rows-[minmax(0,1fr)_minmax(320px,46vh)] overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-2xl outline-none lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-1"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") move(-1);
            if (event.key === "ArrowRight") move(1);
          }}
        >
          <Dialog.Title className="sr-only">
            {detail.作品标题 || "未命名帖子"}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            查看帖子媒体并选择需要下载的资源。
          </Dialog.Description>

          <MediaStage
            activeIndex={visibleIndex}
            current={current}
            media={media}
            onMove={move}
            onSelect={setActiveIndex}
          />

          <div className="flex min-h-0 flex-col bg-white">
            <div className="shrink-0 border-b border-stone-100 px-5 pt-5 pb-4 sm:px-7 sm:pt-7">
              <div className="flex items-start justify-between gap-4">
                <Author
                  avatarUrl={detail.作者.头像地址}
                  name={detail.作者.作者昵称}
                  publishedAt={detail.发布时间}
                />
                <div className="flex items-center gap-1">
                  <button
                    aria-label={`移除帖子：${detail.作品标题 || "未命名帖子"}`}
                    className="grid size-9 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-red-500"
                    onClick={() => {
                      onRemove();
                      onOpenChange(false);
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden size={16} />
                  </button>
                  <Dialog.Close
                    aria-label="关闭详情"
                    className="grid size-9 place-items-center rounded-full text-stone-500 transition hover:bg-stone-100 hover:text-stone-950"
                  >
                    <X aria-hidden size={18} />
                  </Dialog.Close>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-full bg-stone-900 px-2.5 py-1 text-[11px] font-medium text-white">
                  {detail.作品类型}
                </span>
                <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-600">
                  {media.length} 项媒体
                </span>
              </div>
              <h2 className="mt-4 text-xl leading-snug font-semibold tracking-tight text-stone-950">
                {detail.作品标题 || "未命名帖子"}
              </h2>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">
                {detail.作品描述 || "这个帖子没有文字描述。"}
              </p>
              {detail.作品标签.length > 0 && (
                <div className="mt-2 flex max-h-9 flex-wrap gap-x-2 gap-y-1 overflow-hidden">
                  {detail.作品标签.slice(0, 8).map((tag) => (
                    <span className="text-xs text-red-500" key={tag}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                <Metric icon={Heart} label="赞" value={detail.点赞数量} />
                <Metric icon={Star} label="收藏" value={detail.收藏数量} />
                <Metric icon={MessageCircle} label="评论" value={detail.评论数量} />
                <Metric icon={Share2} label="分享" value={detail.分享数量} />
              </div>
            </div>
            <PostDownloadSelection
              activeIndex={visibleIndex}
              allSelected={allSelected}
              media={media}
              onPreviewChange={setActiveIndex}
              onSelectionChange={onSelectionChange}
              post={post}
            />
            <PostDownloadBar
              onDownload={onDownload}
              onForceChange={onForceChange}
              post={post}
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Author({
  avatarUrl,
  name,
  publishedAt,
}: {
  avatarUrl?: string | null;
  name: string;
  publishedAt: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <AuthorAvatar name={name} src={avatarUrl} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-stone-900">{name}</p>
        <p className="mt-0.5 text-xs text-stone-400">
          {formatTime(publishedAt)}
        </p>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Heart;
  label: string;
  value: string;
}) {
  return (
    <div
      aria-label={`${label} ${value}`}
      className="inline-flex items-center gap-1.5 text-stone-500"
    >
      <Icon aria-hidden size={15} />
      <span className="text-xs font-medium text-stone-700">{value}</span>
    </div>
  );
}

function formatTime(value: string | null): string {
  if (!value) return "发布时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
