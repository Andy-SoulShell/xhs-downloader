import { Heart, MessageCircle, Star, X } from "lucide-react";

import type { FeedDetailResult } from "../lib/types";
import { ActionButton } from "./action-button";
import { AuthorAvatar } from "./author-avatar";
import { Metric } from "./metric";

interface BrowserDetailProps {
  detail: FeedDetailResult;
  onClose: () => void;
}

/** 展示浏览器读取的帖子详情与当前已加载评论。 */
export function BrowserDetail({ detail, onClose }: BrowserDetailProps) {
  return (
    <section className="control-shell mt-6 p-5 sm:p-6" aria-label="帖子详情">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <AuthorAvatar
              name={detail.author.nickname}
              src={detail.author.avatar_url}
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-900">
                {detail.author.nickname || "未知作者"}
              </p>
              <p className="text-xs text-stone-500">
                {detail.ip_location || "位置未知"}
              </p>
            </div>
          </div>
          <h2 className="mt-5 text-xl font-semibold text-stone-950">
            {detail.title || "未命名帖子"}
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
            {detail.body || "这个帖子没有文字描述。"}
          </p>
        </div>
        <ActionButton
          aria-label="关闭帖子详情"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X aria-hidden size={18} />
        </ActionButton>
      </div>

      <div className="mt-5 flex flex-wrap gap-4 border-y border-stone-200 py-4">
        <Metric icon={Heart} label="赞" value={detail.metrics.liked_count} />
        <Metric
          icon={Star}
          label="收藏"
          value={detail.metrics.collected_count}
        />
        <Metric
          icon={MessageCircle}
          label="评论"
          value={detail.metrics.comment_count}
        />
      </div>

      <div className="mt-5 space-y-3">
        <h3 className="text-sm font-semibold text-stone-900">
          已加载评论 · {detail.comments.length}
        </h3>
        {detail.comments.length ? (
          detail.comments.map((comment) => (
            <article
              className="rounded-2xl bg-stone-50 p-4"
              key={comment.comment_id}
            >
              <p className="text-xs font-semibold text-stone-700">
                {comment.author.nickname || "未知用户"}
              </p>
              <p className="mt-1 text-sm leading-6 text-stone-600">
                {comment.content}
              </p>
            </article>
          ))
        ) : (
          <p className="text-sm text-stone-500">当前没有已加载评论。</p>
        )}
      </div>
    </section>
  );
}
