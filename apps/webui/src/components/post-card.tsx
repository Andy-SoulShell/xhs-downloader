import {
  CheckCircle2,
  CircleAlert,
  Download,
  Heart,
  Images,
  LoaderCircle,
  MessageCircle,
  PackageOpen,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";

import { groupMedia } from "../lib/media";
import type { PostRecord } from "../lib/workspace";
import { AuthorAvatar } from "./author-avatar";
import { Badge } from "./badge";
import { DownloadProgressBar } from "./download-progress-bar";
import { MediaPreview } from "./media-preview";
import { Metric } from "./metric";
import { PostDetailDialog } from "./post-detail-dialog";

interface PostCardProps {
  post: PostRecord;
  onSelectionChange: (selected: Set<number>) => void;
  onForceChange: (force: boolean) => void;
  onDownload: () => void;
  onRemove: () => void;
}

export function PostCard({
  post,
  onSelectionChange,
  onForceChange,
  onDownload,
  onRemove,
}: PostCardProps) {
  const [open, setOpen] = useState(false);
  const detail = post.result.data;
  const media = useMemo(
    () => groupMedia(detail?.媒体 ?? []),
    [detail?.媒体],
  );
  if (!detail) return null;

  const title = detail.作品标题 || "未命名帖子";
  const status = postStatus(post);
  // 解析不出媒体的帖子仍要占位展示：静默丢弃会让列表数量与实际卡片数对不上，
  // 用户既看不到这条帖子，也无从知道它为什么消失。
  const first = media.at(0);

  return (
    <>
      <article className="feed-card group">
        <div className="relative overflow-hidden rounded-2xl bg-stone-100">
          {first ? (
            <>
              <MediaPreview
                ariaLabel={`打开帖子：${title}`}
                index={first.index}
                onOpen={() => setOpen(true)}
                resources={first.resources}
                title={title}
              />
              <Badge
                className="pointer-events-none absolute top-3 left-3"
                icon={Images}
                size="floating"
                tone="overlay"
              >
                {media.length} 项
              </Badge>
            </>
          ) : (
            <NoMediaCover onOpen={() => setOpen(true)} title={title} />
          )}
          <StatusBadge status={status} />
        </div>

        <div className="px-1 pt-3">
          <button
            aria-label={`打开帖子详情：${title}`}
            className="line-clamp-2 w-full text-left text-[15px] leading-6 font-semibold tracking-tight text-stone-900 transition group-hover:text-red-600"
            onClick={() => setOpen(true)}
            type="button"
          >
            {title}
          </button>
          {post.status === "downloading" && post.progress && (
            <DownloadProgressBar progress={post.progress} />
          )}
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-600">
            <div className="flex min-w-0 items-center gap-2">
              <AuthorAvatar
                name={detail.作者.作者昵称}
                size="small"
                src={detail.作者.头像地址}
              />
              <span className="truncate">{detail.作者.作者昵称}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <Metric
                compact
                icon={Heart}
                label="赞"
                value={detail.点赞数量}
              />
              <Metric
                compact
                icon={Star}
                label="收藏"
                value={detail.收藏数量}
              />
              <Metric
                compact
                icon={MessageCircle}
                label="评论"
                value={detail.评论数量}
              />
            </div>
          </div>
        </div>
      </article>

      <PostDetailDialog
        onDownload={onDownload}
        onForceChange={onForceChange}
        onOpenChange={setOpen}
        onRemove={onRemove}
        onSelectionChange={onSelectionChange}
        open={open}
        post={post}
      />
    </>
  );
}

/**
 * 帖子没有可下载媒体时的封面占位。
 *
 * @param props 组件属性。
 * @param props.title 帖子标题，用于无障碍名称。
 * @param props.onOpen 打开帖子详情的回调。
 * @returns 与正常封面等高、可进入详情的说明性占位。
 */
function NoMediaCover({
  title,
  onOpen,
}: {
  title: string;
  onOpen: () => void;
}) {
  return (
    <button
      aria-label={`打开帖子：${title}`}
      className="grid aspect-3/4 w-full place-items-center bg-stone-100 text-stone-600 transition hover:text-stone-700"
      onClick={onOpen}
      type="button"
    >
      <span className="flex flex-col items-center gap-1.5 px-4 text-center">
        <PackageOpen size={22} strokeWidth={1.5} />
        <span className="text-[11px] leading-tight">没有解析到可下载媒体</span>
      </span>
    </button>
  );
}

type VisibleStatus = "未下载" | "下载中" | "已下载" | "失败";

function postStatus(post: PostRecord): VisibleStatus {
  if (post.status === "downloading") return "下载中";
  if (post.status === "error") return "失败";
  if (post.status === "done" || post.downloaded.size > 0) return "已下载";
  return "未下载";
}

function StatusBadge({ status }: { status: VisibleStatus }) {
  const icon =
    status === "已下载"
      ? CheckCircle2
      : status === "下载中"
        ? LoaderCircle
        : status === "失败"
          ? CircleAlert
          : Download;
  const Icon = icon;
  const color =
    status === "已下载"
      ? "success"
      : status === "下载中"
        ? "warning"
        : status === "失败"
          ? "danger"
          : "surface";

  return (
    <Badge
      className="pointer-events-none absolute top-3 right-3"
      icon={Icon}
      size="floating"
      spinning={status === "下载中"}
      tone={color}
    >
      {status}
    </Badge>
  );
}
