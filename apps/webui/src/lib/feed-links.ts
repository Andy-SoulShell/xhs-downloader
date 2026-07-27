import type { FeedSummary } from "./types";

/**
 * 由浏览结果构造可下载的帖子链接。
 *
 * 访问详情页需要 `xsec_token` 这类访问上下文，去掉它之后即使是公开
 * 帖子也可能解析不到内容，因此缺少该值时不构造链接，由调用方明确
 * 告知用户该结果暂时不能下载，而不是给出一个必定失败的链接。
 *
 * @param feed 浏览或搜索返回的帖子摘要。
 * @returns 可交给解析与下载接口的绝对链接；缺少访问上下文时为空。
 */
export function feedPostUrl(feed: Pick<FeedSummary, "feed_id" | "xsec_token">): string | null {
  if (!feed.feed_id || !feed.xsec_token) return null;
  const url = new URL(`https://www.xiaohongshu.com/explore/${feed.feed_id}`);
  url.searchParams.set("xsec_token", feed.xsec_token);
  url.searchParams.set("xsec_source", "pc_feed");
  return url.toString();
}

/** 帖子暂时不能下载时向用户说明的原因。 */
export const MISSING_ACCESS_HINT =
  "这条结果缺少访问信息，暂时不能下载。重新搜索或刷新推荐通常可以解决。";
