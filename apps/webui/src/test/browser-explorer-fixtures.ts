import type { JsonValue } from "@xhs-downloader/contracts";

import type { CapabilityRoute } from "../lib/browser-api";
import type {
  BrowserTask,
  FeedDetailResult,
  FeedListResult,
  FeedSummary,
} from "../lib/types";

/** 浏览器探索测试使用的完全合成帖子摘要。 */
export const browserFeedFixture: FeedSummary = {
  feed_id: "synthetic-feed",
  xsec_token: "synthetic-token",
  title: "合成浏览帖子",
  note_type: "image",
  author: {
    user_id: "synthetic-author",
    nickname: "合成作者",
    avatar_url: null,
  },
  metrics: {
    liked: false,
    liked_count: "12",
    collected: false,
    collected_count: "3",
    comment_count: "4",
    shared_count: "1",
  },
  cover_url: "https://example.invalid/cover.png",
  cover_width: 1080,
  cover_height: 1440,
  video_duration: null,
};

/** 浏览器探索测试使用的安全回退路由快照。 */
export const browserReadRouteFixture: CapabilityRoute = {
  provider: "browser",
  strategy: "http_first",
  browser_driver: "managed",
  fallback_used: true,
  fallback_reason: {
    provider: "http",
    code: "not_configured",
    message: "Cookie HTTP 尚未配置",
  },
  attempted_providers: ["http", "browser"],
  account_consistency: null,
};

/** 浏览器探索测试使用的完全合成帖子详情。 */
export const browserDetailFixture: FeedDetailResult = {
  feed_id: browserFeedFixture.feed_id,
  xsec_token: browserFeedFixture.xsec_token,
  title: "合成详情",
  body: "仅用于自动化测试",
  note_type: "image",
  author: browserFeedFixture.author,
  metrics: browserFeedFixture.metrics,
  image_urls: [],
  published_at: null,
  ip_location: "合成地点",
  comments: [
    {
      comment_id: "synthetic-comment",
      content: "合成评论",
      author: browserFeedFixture.author,
      liked: false,
      like_count: "0",
      created_at: null,
      ip_location: "",
      reply_count: "0",
      replies: [],
    },
  ],
  comments_has_more: false,
  comments_cursor: "",
};

/** 创建浏览器探索测试使用的推荐列表结果。 */
export function makeBrowserFeedList(
  items: FeedSummary[] = [browserFeedFixture],
): FeedListResult {
  return {
    items,
    source: "home",
    keyword: null,
    has_more: false,
    cursor: "",
  };
}

/** 创建带指定结构化结果的已完成浏览器任务。 */
export function makeCompletedBrowserTask(
  result: Record<string, JsonValue>,
): BrowserTask {
  return {
    task_id: "synthetic-browser-task",
    request_id: "synthetic-request",
    kind: "list_feeds",
    payload: {},
    status: "succeeded",
    result,
    target_driver: "extension",
    executor_id: "synthetic-extension",
    extension_id: "synthetic-extension",
    lease_expires_at: null,
    attempts: 1,
    message: "合成任务完成",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}
