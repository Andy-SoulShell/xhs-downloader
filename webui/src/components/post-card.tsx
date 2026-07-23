import {
  CheckCircle2,
  CircleAlert,
  Download,
  Heart,
  Images,
  LoaderCircle,
  MessageCircle,
  Star,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { PostRecord } from "../app";
import { groupMedia } from "../lib/media";
import { AuthorAvatar } from "./author-avatar";
import { MediaPreview } from "./media-preview";
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
  if (!detail || !media.length) return null;

  const title = detail.作品标题 || "未命名帖子";
  const status = postStatus(post);
  const first = media[0];

  return (
    <>
      <article className="feed-card group">
        <div className="relative overflow-hidden rounded-2xl bg-stone-100">
          <MediaPreview
            ariaLabel={`打开帖子：${title}`}
            index={first.index}
            onOpen={() => setOpen(true)}
            resources={first.resources}
            title={title}
          />
          <span className="pointer-events-none absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-stone-950/75 px-2.5 py-1.5 text-[10px] font-medium text-white backdrop-blur">
            <Images aria-hidden size={12} />
            {media.length} 项
          </span>
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
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-stone-500">
            <div className="flex min-w-0 items-center gap-2">
              <AuthorAvatar
                name={detail.作者.作者昵称}
                size="small"
                src={detail.作者.头像地址}
              />
              <span className="truncate">{detail.作者.作者昵称}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <CompactMetric
                icon={Heart}
                label="赞"
                value={detail.点赞数量}
              />
              <CompactMetric
                icon={Star}
                label="收藏"
                value={detail.收藏数量}
              />
              <CompactMetric
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

function CompactMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Heart;
  label: string;
  value: string;
}) {
  return (
    <span
      aria-label={`${label} ${value}`}
      className="inline-flex items-center gap-1"
    >
      <Icon aria-hidden size={13} />
      {value}
    </span>
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
      ? "bg-emerald-50/95 text-emerald-700"
      : status === "下载中"
        ? "bg-amber-50/95 text-amber-700"
        : status === "失败"
          ? "bg-red-50/95 text-red-600"
          : "bg-white/92 text-stone-600";

  return (
    <span
      className={`pointer-events-none absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[10px] font-medium shadow-sm backdrop-blur ${color}`}
    >
      <Icon
        aria-hidden
        className={status === "下载中" ? "animate-spin" : ""}
        size={12}
      />
      {status}
    </span>
  );
}
