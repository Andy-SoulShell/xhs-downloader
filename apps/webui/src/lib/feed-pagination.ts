import type { JsonValue } from "@xhs-downloader/contracts";

import { executeReadCapability, type CapabilityRoute } from "./browser-api";
import type { FeedListResult, FeedSummary } from "./types";

/** 当前浏览结果的来源；关闭详情和加载更多都要沿用它。 */
export interface FeedContext {
  source: "home" | "search";
  keyword: string;
  cursor: string;
  hasMore: boolean;
}

/** 一次翻页的结果。 */
export interface FeedPage {
  items: FeedSummary[];
  context: FeedContext;
  route: CapabilityRoute;
}

/** 由一次读取结果记录浏览来源，供后续翻页沿用。 */
export function feedContextFrom(
  source: FeedContext["source"],
  keyword: string,
  result: FeedListResult,
): FeedContext {
  return {
    source,
    keyword,
    cursor: result.cursor,
    hasMore: result.has_more,
  };
}

/**
 * 按当前来源读取下一页。
 *
 * 搜索与推荐使用各自的接口，但共用同一个游标语义；调用方据此把新结果
 * 追加到已有列表，而不是替换掉用户正在看的内容。
 *
 * @param context 当前浏览来源与游标。
 * @param signal 取消信号。
 * @returns 下一页结果与更新后的浏览来源。
 */
export async function loadNextFeedPage(
  context: FeedContext,
  signal: AbortSignal,
): Promise<FeedPage> {
  const path =
    context.source === "search" ? "/xhs/feeds/search" : "/xhs/feeds/list";
  const payload: Record<string, JsonValue> =
    context.source === "search"
      ? { keyword: context.keyword, filters: {}, cursor: context.cursor }
      : { cursor: context.cursor };
  const result = await executeReadCapability<FeedListResult>(
    path,
    payload,
    signal,
  );
  return {
    items: result.data.items,
    context: feedContextFrom(context.source, context.keyword, result.data),
    route: result.route,
  };
}

/** 追加新结果并按帖子标识去重，避免翻页时出现重复卡片。 */
export function appendUniqueFeeds(
  current: FeedSummary[],
  incoming: FeedSummary[],
): FeedSummary[] {
  const known = new Set(current.map((item) => item.feed_id));
  return [...current, ...incoming.filter((item) => !known.has(item.feed_id))];
}
