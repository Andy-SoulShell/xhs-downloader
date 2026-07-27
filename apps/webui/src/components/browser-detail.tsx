import { Heart, MessageCircle, Send, Star, X } from "lucide-react";
import { useState } from "react";
import { Dialog } from "radix-ui";

import type { FeedDetailResult } from "../lib/types";
import { ActionButton } from "./action-button";
import { AuthorAvatar } from "./author-avatar";
import { Metric } from "./metric";

interface BrowserDetailProps {
  busy: boolean;
  /** 当前使用是否实现评论与回复；软件自带浏览器尚未支持。 */
  commentEnabled?: boolean;
  detail: FeedDetailResult;
  onComment: (content: string) => Promise<boolean>;
  onClose: () => void;
  onReply: (commentId: string, content: string) => Promise<boolean>;
  onSetFavorite: (active: boolean) => Promise<unknown>;
  onSetLike: (active: boolean) => Promise<unknown>;
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
    run: () => Promise<unknown>;
  } | null>(null);

  const queue = (label: string, run: () => Promise<unknown>) => setConfirmation({ label, run });
  const confirm = async () => {
    const action = confirmation;
    setConfirmation(null);
    if (action) await action.run();
  };

  // 详情原本是就地插进列表上方的一块，用户点开一条帖子，视线要从卡片跳回页面
  // 顶部去找它，列表还被顶下去。改成弹窗：既和「我的帖子」的详情一致，
  // 也不会打乱正在浏览的位置。挂载即打开，关闭交回给 onClose 卸载。
  return (
    <Dialog.Root
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      open
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[min(92vh,880px)] w-[min(96vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border border-white/30 bg-white shadow-[0_28px_80px_rgba(28,25,23,0.38)] outline-none">
          <Dialog.Description className="sr-only">
            查看这条帖子的正文、互动与已加载评论。
          </Dialog.Description>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <AuthorAvatar name={detail.author.nickname} src={detail.author.avatar_url} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-900">
                      {detail.author.nickname || "未知作者"}
                    </p>
                    <p className="text-xs text-stone-600">{detail.ip_location || "位置未知"}</p>
                  </div>
                </div>
                {/* 弹窗的可访问名称直接用这个可见标题，不再另挂一个 sr-only 的重复标题 */}
                <Dialog.Title asChild>
                  <h2 className="mt-5 text-xl font-semibold text-stone-950">
                    {detail.title || "未命名帖子"}
                  </h2>
                </Dialog.Title>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-600">
                  {detail.body || "这个帖子没有文字描述。"}
                </p>
              </div>
              <Dialog.Close asChild>
                <ActionButton aria-label="关闭帖子详情" size="icon" variant="ghost">
                  <X aria-hidden size={18} />
                </ActionButton>
              </Dialog.Close>
            </div>

            <div className="mt-5 flex flex-wrap gap-4 border-y border-stone-200 py-4">
              <Metric icon={Heart} label="赞" value={detail.metrics.liked_count} />
              <Metric icon={Star} label="收藏" value={detail.metrics.collected_count} />
              <Metric icon={MessageCircle} label="评论" value={detail.metrics.comment_count} />
              <div className="ml-auto flex flex-wrap gap-2">
                <ActionButton
                  disabled={busy || !writeEnabled}
                  onClick={() =>
                    queue(detail.metrics.liked ? "取消点赞" : "点赞", () =>
                      onSetLike(!detail.metrics.liked),
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
                    queue(detail.metrics.collected ? "取消收藏" : "收藏", () =>
                      onSetFavorite(!detail.metrics.collected),
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
                  <ActionButton onClick={() => setConfirmation(null)} variant="ghost">
                    取消
                  </ActionButton>
                  <ActionButton disabled={busy || !writeEnabled} onClick={() => void confirm()}>
                    确认执行
                  </ActionButton>
                </div>
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
              {!writeEnabled && (
                <p className="mb-3 text-xs leading-5 text-amber-700">
                  连接方式尚未确认，互动、评论和回复已停用。
                </p>
              )}
              {writeEnabled && !commentEnabled && (
                <p className="mb-3 text-xs leading-5 text-amber-700">
                  软件自带浏览器尚未支持评论与回复，请切换到浏览器扩展连接方式。
                </p>
              )}
              <label className="text-sm font-semibold text-stone-900" htmlFor="browser-comment">
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
                    className="text-xs text-stone-600 hover:text-stone-900"
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
                      const ok = replyTarget
                        ? await onReply(replyTarget, content)
                        : await onComment(content);
                      // 失败时保留用户写的内容：清空等于让人白写一遍。
                      if (!ok) return;
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
                  <article className="rounded-2xl bg-stone-50 p-4" key={comment.comment_id}>
                    <p className="text-xs font-semibold text-stone-700">
                      {comment.author.nickname || "未知用户"}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">{comment.content}</p>
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
                <p className="text-sm text-stone-600">当前没有已加载评论。</p>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
