import type {
  FeedAuthor,
  FeedListResult,
  FeedMetrics,
  FeedSummary,
} from "@xhs-downloader/contracts";

import {
  dataBoolean,
  dataInteger,
  dataList,
  dataRecord,
  dataText,
  dataUrl,
  latestInitialState,
  unwrapState,
} from "./page-data";

/** 从推荐页或搜索页解析标准 Feed 列表。 */
export function parseFeedListDocument(
  page: Document,
  source: FeedListResult["source"],
  keyword: string | null = null,
  currentState?: Record<string, unknown>,
): FeedListResult {
  const state = currentState ?? latestInitialState(page);
  const container = dataRecord(state[source === "home" ? "feed" : "search"]);
  if (!("feeds" in container)) {
    throw new Error(source === "home" ? "推荐流尚未加载" : "搜索结果尚未加载");
  }
  return {
    items: parseFeedSummaries(unwrapState(container.feeds)).slice(0, 200),
    source,
    keyword: source === "search" ? keyword : null,
    has_more: dataBoolean(container.hasMore ?? container.has_more),
    cursor: dataText(container.cursor).slice(0, 2048),
  };
}

/** 把平台 Feed 数组转换为稳定摘要结构。 */
export function parseFeedSummaries(value: unknown): FeedSummary[] {
  return flattenFeeds(value)
    .map(parseFeedSummary)
    .filter((item): item is FeedSummary => item !== null);
}

/** 解析 Feed 卡片中的作者。 */
export function parseFeedAuthor(value: unknown): FeedAuthor | null {
  const user = dataRecord(value);
  const userId = dataText(user.userId ?? user.user_id);
  if (!userId) return null;
  return {
    user_id: userId,
    nickname: dataText(user.nickname ?? user.nickName).slice(0, 200),
    avatar_url: dataUrl(user.avatar ?? user.image),
  };
}

/** 解析平台互动状态和展示计数。 */
export function parseFeedMetrics(value: unknown): FeedMetrics {
  const metrics = dataRecord(value);
  return {
    liked: dataBoolean(metrics.liked),
    liked_count: dataText(metrics.likedCount) || "0",
    collected: dataBoolean(metrics.collected),
    collected_count: dataText(metrics.collectedCount) || "0",
    comment_count: dataText(metrics.commentCount) || "0",
    shared_count: dataText(metrics.sharedCount) || "0",
  };
}

function parseFeedSummary(value: unknown): FeedSummary | null {
  const feed = dataRecord(value);
  const note = dataRecord(feed.noteCard);
  const author = parseFeedAuthor(note.user);
  const feedId = dataText(feed.id ?? note.noteId);
  if (!feedId || !author) return null;
  const cover = dataRecord(note.cover);
  const video = dataRecord(note.video);
  const capability = dataRecord(video.capa);
  return {
    feed_id: feedId,
    xsec_token: dataText(feed.xsecToken ?? note.xsecToken),
    title: dataText(note.displayTitle ?? note.title).slice(0, 500),
    note_type: noteType(note.type),
    author,
    metrics: parseFeedMetrics(note.interactInfo),
    cover_url: dataUrl(cover.urlDefault ?? cover.urlPre ?? cover.url),
    cover_width: dataInteger(cover.width),
    cover_height: dataInteger(cover.height),
    video_duration: dataInteger(capability.duration),
  };
}

function flattenFeeds(value: unknown): unknown[] {
  return dataList(value).flatMap((item) => (Array.isArray(item) ? flattenFeeds(item) : [item]));
}

function noteType(value: unknown): FeedSummary["note_type"] {
  const type = dataText(value).toLowerCase();
  if (type === "video") return "video";
  if (type === "normal" || type === "image") return "image";
  return "unknown";
}
