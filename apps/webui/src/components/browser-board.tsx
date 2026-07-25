import {
  CircleAlert,
  Compass,
  Heart,
  LoaderCircle,
  LogIn,
  MessageCircle,
  Search,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import type { FeedSummary } from "../lib/types";
import { useBrowserExplorer } from "../lib/use-browser-explorer";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { BrowserDetail } from "./browser-detail";
import { EmptyState } from "./empty-state";
import { Metric } from "./metric";
import { PageHeading } from "./page-heading";

/** 浏览器登录态、内容探索和互动操作的统一工作台。 */
export function BrowserBoard() {
  const explorer = useBrowserExplorer();
  const [keyword, setKeyword] = useState("");

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = keyword.trim();
    if (value) void explorer.search(value);
  };

  return (
    <section>
      <PageHeading
        description="由浏览器扩展使用当前小红书登录态读取与交互；Cookie 始终留在浏览器内。"
        meta={
          explorer.task ? `任务 ${explorer.task.task_id.slice(0, 8)}` : "浏览能力"
        }
        title="浏览器探索"
        actions={
          <div className="flex flex-wrap gap-2">
            <ActionButton
              disabled={explorer.busy}
              onClick={() => void explorer.checkLogin()}
              variant="outline"
            >
              <LogIn aria-hidden size={15} />
              检查登录
            </ActionButton>
            <ActionButton
              disabled={explorer.busy}
              onClick={() => void explorer.loadFeeds()}
            >
              <Compass aria-hidden size={15} />
              读取推荐
            </ActionButton>
          </div>
        }
      />

      <div className="control-shell p-4 sm:p-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submitSearch}>
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">搜索小红书帖子</span>
            <Search
              aria-hidden
              className="absolute top-1/2 left-4 -translate-y-1/2 text-stone-400"
              size={17}
            />
            <input
              className="h-12 w-full rounded-2xl border border-stone-200 bg-white pr-4 pl-11 text-sm outline-none transition focus:border-red-300 focus:ring-4 focus:ring-red-100"
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="输入关键词，通过已登录浏览器搜索"
              value={keyword}
            />
          </label>
          <ActionButton
            disabled={explorer.busy || !keyword.trim()}
            size="large"
            type="submit"
          >
            {explorer.busy ? (
              <LoaderCircle aria-hidden className="animate-spin" size={16} />
            ) : (
              <Search aria-hidden size={16} />
            )}
            搜索
          </ActionButton>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge
            tone={
              explorer.account?.logged_in
                ? "success"
                : explorer.account
                  ? "warning"
                  : "neutral"
            }
          >
            {explorer.account?.logged_in
              ? `已登录${explorer.account.nickname ? ` · ${explorer.account.nickname}` : ""}`
              : explorer.account
                ? "尚未登录"
                : "登录状态待检查"}
          </Badge>
          {explorer.error && (
            <Badge icon={CircleAlert} tone="danger">
              {explorer.error}
            </Badge>
          )}
        </div>
      </div>

      {explorer.detail && (
        <BrowserDetail
          busy={explorer.busy}
          detail={explorer.detail}
          onComment={(content) => explorer.postComment(content)}
          onClose={() => void explorer.loadFeeds()}
          onReply={(commentId, content) =>
            explorer.replyComment(commentId, content)
          }
          onSetFavorite={(active) =>
            explorer.setInteraction("favorite", active)
          }
          onSetLike={(active) => explorer.setInteraction("like", active)}
        />
      )}

      <div className="mt-6">
        {explorer.feeds.length ? (
          <div className="feed-grid">
            {explorer.feeds.map((feed) => (
              <BrowserFeedCard
                feed={feed}
                key={feed.feed_id}
                onOpen={() => void explorer.openFeed(feed)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            description="先检查登录状态，然后读取首页推荐或按关键词搜索。"
            icon={Compass}
            title={explorer.busy ? "浏览器正在执行任务" : "还没有浏览结果"}
          />
        )}
      </div>
    </section>
  );
}

function BrowserFeedCard({
  feed,
  onOpen,
}: {
  feed: FeedSummary;
  onOpen: () => void;
}) {
  return (
    <article className="feed-card min-w-0">
      <button
        aria-label={`读取帖子详情：${feed.title || "未命名帖子"}`}
        className="block w-full overflow-hidden rounded-2xl bg-stone-100 text-left"
        disabled={!feed.xsec_token}
        onClick={onOpen}
        type="button"
      >
        {feed.cover_url ? (
          <img
            alt=""
            className="aspect-[3/4] w-full object-cover"
            src={feed.cover_url}
          />
        ) : (
          <span className="grid aspect-[3/4] place-items-center text-sm text-stone-400">
            暂无封面
          </span>
        )}
      </button>
      <h2 className="mt-3 line-clamp-2 text-sm leading-6 font-semibold text-stone-900">
        {feed.title || "未命名帖子"}
      </h2>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-3 text-xs text-stone-500">
        <span className="truncate">{feed.author.nickname || "未知作者"}</span>
        <span className="flex shrink-0 gap-2">
          <Metric
            compact
            icon={Heart}
            label="赞"
            value={feed.metrics.liked_count}
          />
          <Metric
            compact
            icon={MessageCircle}
            label="评论"
            value={feed.metrics.comment_count}
          />
        </span>
      </div>
    </article>
  );
}
