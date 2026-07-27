import { useMemo, useState } from "react";
import {
  Heart,
  MessageCircle,
  PackageOpen,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";

import { groupMedia } from "../lib/media";
import type { PostRecord } from "../lib/workspace";
import { AuthorAvatar } from "./author-avatar";
import { Badge } from "./badge";
import { MediaStage } from "./media-stage";
import { Metric } from "./metric";
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

  if (!detail) return null;
  // 解析不出媒体的帖子依然要能打开：正文、作者、标签仍有价值，
  // 更重要的是“移除”这条出路必须够得着。
  const hasMedia = media.length > 0;
  const visibleIndex = hasMedia ? Math.min(activeIndex, media.length - 1) : 0;
  const current = media[visibleIndex];
  const allSelected =
    hasMedia && media.every((item) => post.selected.has(item.index));
  const move = (step: number) => {
    if (!hasMedia) return;
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 grid h-[min(94vh,880px)] w-[min(96vw,1120px)] -translate-x-1/2 -translate-y-1/2 grid-rows-[minmax(0,1fr)_minmax(320px,46vh)] overflow-hidden rounded-[22px] border border-white/30 bg-stone-950 shadow-[0_28px_80px_rgba(28,25,23,0.38)] ring-1 ring-stone-950/10 outline-none lg:w-max lg:max-w-[96vw] lg:grid-cols-[auto_400px] lg:grid-rows-1"
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

          {current ? (
            <MediaStage
              activeIndex={visibleIndex}
              current={current}
              media={media}
              onMove={move}
              onSelect={setActiveIndex}
            />
          ) : (
            <MediaUnavailableStage />
          )}

          <div className="flex min-h-0 flex-col border-l border-stone-200/80 bg-white">
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
                <Badge size="regular" tone="dark">
                  {detail.作品类型}
                </Badge>
                <Badge size="regular" tone={hasMedia ? "accent" : "warning"}>
                  {hasMedia ? `${media.length} 项媒体` : "无可下载媒体"}
                </Badge>
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
            {hasMedia ? (
              <>
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
              </>
            ) : (
              <p className="notice-block m-5 mt-auto text-sm leading-6">
                这个帖子没有解析到可下载的媒体，可能是链接已失效或需要登录后才能查看。
                可以重新粘贴链接再试一次，或者用右上角的按钮把它移除。
              </p>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * 帖子没有可用媒体时，详情左侧展示台的替代内容。
 *
 * @returns 与媒体展示台同样占位、说明原因的深色面板。
 */
function MediaUnavailableStage() {
  return (
    <div className="grid min-h-0 place-items-center bg-stone-950 px-8 py-16 text-center lg:w-[560px]">
      <span className="flex flex-col items-center gap-3 text-stone-500">
        <PackageOpen size={34} strokeWidth={1.25} />
        <span className="text-sm">没有解析到可下载媒体</span>
      </span>
    </div>
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

function formatTime(value: string | null): string {
  if (!value) return "发布时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
