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

/** 登录状态任务返回的最小账号信息，不包含 Cookie。 */
export interface BrowserLoginState {
  logged_in: boolean;
  user_id: string | null;
  nickname: string | null;
}
