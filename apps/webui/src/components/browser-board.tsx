import {
  CircleAlert,
  Compass,
  Download,
  Heart,
  LoaderCircle,
  MessageCircle,
  Search,
} from "lucide-react";
import { useState, type FormEvent } from "react";

import type { FeedSummary } from "../lib/types";
import { isBrowserDriver } from "../lib/types";
import { feedPostUrl, MISSING_ACCESS_HINT } from "../lib/feed-links";
import { useBrowserExplorer } from "../lib/use-browser-explorer";
import { useManagedBrowser } from "../lib/use-managed-browser";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { BrowserDetail } from "./browser-detail";
import { BrowserLoginActions } from "./browser-login-actions";
import { EmptyState } from "./empty-state";
import { Metric } from "./metric";
import { PageHeading } from "./page-heading";

/**
 * 浏览小红书并就地下载。
 *
 * @param browserDriver 当前连接方式；未确认时停用登录与互动。
 * @param onDownload 把一条浏览结果交给下载；由内容工作台提供。
 */
export function BrowserBoard({
  browserDriver = null,
  onDownload,
}: {
  browserDriver?: unknown;
  onDownload?: (url: string, title: string) => Promise<void>;
}) {
  const explorer = useBrowserExplorer();
  const managedBrowser = useManagedBrowser();
  const [keyword, setKeyword] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const confirmedDriver = isBrowserDriver(browserDriver)
    ? browserDriver
    : null;

  const handleDownload = async (feed: FeedSummary) => {
    const url = feedPostUrl(feed);
    if (!url) {
      setHint(MISSING_ACCESS_HINT);
      return;
    }
    if (!onDownload) return;
    setHint("");
    setDownloadingId(feed.feed_id);
    try {
      await onDownload(url, feed.title || "未命名帖子");
    } finally {
      setDownloadingId(null);
    }
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = keyword.trim();
    if (value) void explorer.search(value);
  };

  return (
    <section>
      <PageHeading
        description="用你已登录的小红书浏览推荐和搜索，看到喜欢的可以直接下载。"
        meta={explorer.feeds.length ? `${explorer.feeds.length} 条` : ""}
        title="浏览小红书"
        actions={
          <ActionButton
            disabled={explorer.busy}
            onClick={() => void explorer.loadFeeds()}
          >
            <Compass aria-hidden size={15} />
            看看推荐
          </ActionButton>
        }
      />

      <BrowserLoginActions
        browserDriver={confirmedDriver}
        busy={explorer.busy}
        managedStatus={managedBrowser.status}
        message={explorer.sessionMessage}
        onCheckLogin={explorer.checkLogin}
        onDeleteCookies={explorer.deleteBrowserCookies}
        onGetQrCode={explorer.getLoginQrCode}
        qrCode={explorer.qrCode}
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
              placeholder="搜索小红书，例如：露营装备"
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
          {!confirmedDriver && (
            <Badge icon={CircleAlert} tone="warning">
              还没有选好连接方式，请先到设置里完成
            </Badge>
          )}
          {hint && (
            <Badge icon={CircleAlert} tone="warning">
              {hint}
            </Badge>
          )}
        </div>
      </div>

      {explorer.detail && (
        <BrowserDetail
          busy={explorer.busy}
          commentEnabled={confirmedDriver !== "managed"}
          detail={explorer.detail}
          onComment={(content) => explorer.postComment(content)}
          onClose={explorer.closeDetail}
          onReply={(commentId, content) =>
            explorer.replyComment(commentId, content)
          }
          onSetFavorite={(active) =>
            explorer.setInteraction("favorite", active)
          }
          onSetLike={(active) => explorer.setInteraction("like", active)}
          writeEnabled={confirmedDriver !== null}
        />
      )}

      <div className="mt-6">
        {explorer.feeds.length ? (
          <div className="feed-grid">
            {explorer.feeds.map((feed) => (
              <BrowserFeedCard
                downloading={downloadingId === feed.feed_id}
                feed={feed}
                key={feed.feed_id}
                onDownload={() => void handleDownload(feed)}
                onOpen={() => void explorer.openFeed(feed)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            description="点上面的「看看推荐」，或者搜索你想找的内容。"
            icon={Compass}
            title={explorer.busy ? "正在打开小红书" : "还没有内容"}
          />
        )}
        {explorer.context?.hasMore && (
          <div className="mt-6 flex justify-center">
            <ActionButton
              disabled={explorer.loadingMore}
              onClick={() => void explorer.loadMore()}
              variant="outline"
            >
              {explorer.loadingMore ? (
                <LoaderCircle aria-hidden className="animate-spin" size={14} />
              ) : null}
              {explorer.loadingMore ? "正在加载" : "加载更多"}
            </ActionButton>
          </div>
        )}
      </div>
    </section>
  );
}

function BrowserFeedCard({
  downloading,
  feed,
  onDownload,
  onOpen,
}: {
  downloading: boolean;
  feed: FeedSummary;
  onDownload: () => void;
  onOpen: () => void;
}) {
  // 缺少访问上下文时详情和下载都无法完成，明确说明而不是让按钮默默失效。
  const accessible = Boolean(feed.xsec_token);
  const title = feed.title || "未命名帖子";

  return (
    <article className="feed-card min-w-0">
      <button
        aria-label={`打开「${title}」`}
        className="block w-full overflow-hidden rounded-2xl bg-stone-100 text-left disabled:cursor-not-allowed"
        disabled={!accessible}
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
        {title}
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
      {accessible ? (
        <ActionButton
          className="mt-3 w-full"
          disabled={downloading}
          onClick={onDownload}
          variant="outline"
        >
          {downloading ? (
            <LoaderCircle aria-hidden className="animate-spin" size={14} />
          ) : (
            <Download aria-hidden size={14} />
          )}
          {downloading ? "正在提交" : "下载"}
        </ActionButton>
      ) : (
        <p className="mt-3 text-[11px] leading-5 text-amber-700">
          这条暂时打不开，重新搜索一下试试。
        </p>
      )}
    </article>
  );
}
