/** 服务端与浏览器客户端共享的稳定协议。 */
/** 浏览器扩展与本地服务协商使用的协议版本。 */
export const EXTENSION_PROTOCOL_VERSION = 1;

/** 负责执行媒体下载的一侧。 */
export type DownloadMode = "browser" | "background";

/** 浏览器扩展同步到本地服务的下载结果。 */
export interface ClientDownloadRecord {
  record_id: string;
  work_id: string;
  source_url: string;
  title: string;
  mode: DownloadMode;
  status: "completed" | "failed";
  media_indexes: number[];
  created_at: string;
  message: string;
}

/** 可跨 HTTP 与扩展消息边界传输的 JSON 值。 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** 浏览器扩展当前支持的任务类型。 */
export type BrowserTaskKind =
  | "check_login_status"
  | "list_feeds"
  | "search_feeds"
  | "get_feed_detail"
  | "get_user_profile"
  | "get_my_profile"
  | "set_like"
  | "set_favorite"
  | "post_comment"
  | "reply_comment";

/** 服务端持久化的浏览器任务状态。 */
export type BrowserTaskStatus =
  | "queued"
  | "claimed"
  | "running"
  | "succeeded"
  | "failed"
  | "needs_review";

/** 服务端与扩展共享的浏览器任务快照。 */
export interface BrowserTask {
  task_id: string;
  request_id: string | null;
  kind: BrowserTaskKind;
  payload: Record<string, JsonValue>;
  status: BrowserTaskStatus;
  result: Record<string, JsonValue> | null;
  extension_id: string | null;
  lease_expires_at: string | null;
  attempts: number;
  message: string;
  created_at: string;
  updated_at: string;
}

/** 扩展领取浏览器任务后获得的短期执行凭据。 */
export interface BrowserTaskClaim {
  task: BrowserTask;
  lease_token: string;
}

/** 本机服务记录的浏览器扩展登记与最近心跳。 */
export interface BrowserExtensionStatus {
  extension_id: string;
  registered_at: string;
  last_seen_at: string;
  online: boolean;
}

/** 登录状态任务返回的最小账号信息，不包含 Cookie。 */
export interface BrowserLoginState {
  logged_in: boolean;
  user_id: string | null;
  nickname: string | null;
}

/** Feed 卡片、详情和评论共用的作者信息。 */
export interface FeedAuthor {
  user_id: string;
  nickname: string;
  avatar_url: string | null;
}

/** 平台展示的互动状态与计数字符串。 */
export interface FeedMetrics {
  liked: boolean;
  liked_count: string;
  collected: boolean;
  collected_count: string;
  comment_count: string;
  shared_count: string;
}

/** 推荐、搜索和用户主页中的帖子摘要。 */
export interface FeedSummary {
  feed_id: string;
  xsec_token: string;
  title: string;
  note_type: "image" | "video" | "unknown";
  author: FeedAuthor;
  metrics: FeedMetrics;
  cover_url: string | null;
  cover_width: number | null;
  cover_height: number | null;
  video_duration: number | null;
}

/** 推荐流或搜索结果。 */
export interface FeedListResult {
  items: FeedSummary[];
  source: "home" | "search";
  keyword: string | null;
  has_more: boolean;
  cursor: string;
}

/** 帖子详情中的评论或回复。 */
export interface FeedComment {
  comment_id: string;
  content: string;
  author: FeedAuthor;
  liked: boolean;
  like_count: string;
  created_at: number | null;
  ip_location: string;
  reply_count: string;
  replies: FeedComment[];
}

/** 帖子详情及当前已加载的评论。 */
export interface FeedDetailResult {
  feed_id: string;
  xsec_token: string;
  title: string;
  body: string;
  note_type: "image" | "video" | "unknown";
  author: FeedAuthor;
  metrics: FeedMetrics;
  image_urls: string[];
  published_at: number | null;
  ip_location: string;
  comments: FeedComment[];
  comments_has_more: boolean;
  comments_cursor: string;
}

/** 用户主页展示的一项统计值。 */
export interface ProfileMetric {
  name: string;
  count: string;
  metric_type: string;
}

/** 指定用户或当前账号的主页数据。 */
export interface UserProfileResult {
  user_id: string | null;
  nickname: string;
  red_id: string;
  description: string;
  avatar_url: string | null;
  ip_location: string;
  metrics: ProfileMetric[];
  feeds: FeedSummary[];
}

/** 点赞或收藏达到目标状态后的核验结果。 */
export interface DesiredStateResult {
  feed_id: string;
  active: boolean;
  changed: boolean;
  verified: true;
}

/** 评论或回复提交后的核验结果。 */
export interface CommentResult {
  feed_id: string;
  comment_id: string | null;
  verified: true;
}
