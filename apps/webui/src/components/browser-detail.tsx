import { Heart, MessageCircle, Send, Star, X } from "lucide-react";
import { useState } from "react";

import type { FeedDetailResult } from "../lib/types";
import { ActionButton } from "./action-button";
import { AuthorAvatar } from "./author-avatar";
import { Metric } from "./metric";

interface BrowserDetailProps {
  busy: boolean;
  /** 当前执行器是否实现评论与回复；受管浏览器尚未支持。 */
  commentEnabled?: boolean;
  detail: FeedDetailResult;
  onComment: (content: string) => Promise<void>;
  onClose: () => void;
  onReply: (commentId: string, content: string) => Promise<void>;
  onSetFavorite: (active: boolean) => Promise<void>;
  onSetLike: (active: boolean) => Promise<void>;
  writeEnabled?: boolean;
}

/** 展示帖子详情、已加载评论和需要二次确认的互动操作。 */
export function BrowserDetail({
  busy,
  commentEnabled = true,
  detail,
  onComment,
  onClose,
  onReply,
  onSetFavorite,
  onSetLike,
  writeEnabled = true,
}: BrowserDetailProps) {
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    label: string;
    run: () => Promise<void>;
  } | null>(null);

  const queue = (label: string, run: () => Promise<void>) =>
    setConfirmation({ label, run });
  const confirm = async () => {
    const action = confirmation;
    setConfirmation(null);
    if (action) await action.run();
  };

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
        <div className="ml-auto flex flex-wrap gap-2">
          <ActionButton
            disabled={busy || !writeEnabled}
            onClick={() =>
              queue(
                detail.metrics.liked ? "取消点赞" : "点赞",
                () => onSetLike(!detail.metrics.liked),
              )
            }
            variant="outline"
          >
            <Heart aria-hidden size={14} />
            {detail.metrics.liked ? "取消点赞" : "点赞"}
          </ActionButton>
          <ActionButton
            disabled={busy || !writeEnabled}
            onClick={() =>
              queue(
                detail.metrics.collected ? "取消收藏" : "收藏",
                () => onSetFavorite(!detail.metrics.collected),
              )
            }
            variant="outline"
          >
            <Star aria-hidden size={14} />
            {detail.metrics.collected ? "取消收藏" : "收藏"}
          </ActionButton>
        </div>
      </div>

      {confirmation && (
        <div
          aria-label="确认写操作"
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
          role="alertdialog"
        >
          <p className="text-sm font-semibold text-amber-900">
            确认要{confirmation.label}吗？
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-700">
            操作会通过当前登录浏览器写入小红书；结果无法确认时将转为人工核对。
          </p>
          <div className="mt-3 flex gap-2">
            <ActionButton
              onClick={() => setConfirmation(null)}
              variant="ghost"
            >
              取消
            </ActionButton>
            <ActionButton
              disabled={busy || !writeEnabled}
              onClick={() => void confirm()}
            >
              确认执行
            </ActionButton>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
        {!writeEnabled && (
          <p className="mb-3 text-xs leading-5 text-amber-700">
            浏览器执行器尚未确认，互动、评论和回复已停用。
          </p>
        )}
        {writeEnabled && !commentEnabled && (
          <p className="mb-3 text-xs leading-5 text-amber-700">
            受管浏览器尚未支持评论与回复，请切换到浏览器扩展执行器。
          </p>
        )}
        <label
          className="text-sm font-semibold text-stone-900"
          htmlFor="browser-comment"
        >
          {replyTarget ? "回复评论" : "发表评论"}
        </label>
        <textarea
          className="mt-3 min-h-24 w-full resize-y rounded-xl border border-stone-200 p-3 text-sm outline-none focus:border-red-300 focus:ring-4 focus:ring-red-100"
          id="browser-comment"
          disabled={!writeEnabled || !commentEnabled}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={replyTarget ? "输入回复内容" : "输入评论内容"}
          value={draft}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          {replyTarget ? (
            <button
              className="text-xs text-stone-500 hover:text-stone-900"
              onClick={() => setReplyTarget(null)}
              type="button"
            >
              取消回复
            </button>
          ) : (
            <span className="text-xs text-stone-400">{draft.length}/1000</span>
          )}
          <ActionButton
            disabled={busy || !writeEnabled || !commentEnabled || !draft.trim()}
            onClick={() => {
              const content = draft.trim();
              queue(replyTarget ? "提交回复" : "发表评论", async () => {
                if (replyTarget) await onReply(replyTarget, content);
                else await onComment(content);
                setDraft("");
                setReplyTarget(null);
              });
            }}
          >
            <Send aria-hidden size={14} />
            {replyTarget ? "回复" : "评论"}
          </ActionButton>
        </div>
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
              <button
                className="mt-2 text-xs font-medium text-red-600 hover:text-red-700"
                disabled={!writeEnabled || !commentEnabled}
                onClick={() => {
                  setReplyTarget(comment.comment_id);
                  setDraft("");
                }}
                type="button"
              >
                回复
              </button>
            </article>
          ))
        ) : (
          <p className="text-sm text-stone-500">当前没有已加载评论。</p>
        )}
      </div>
    </section>
  );
}
