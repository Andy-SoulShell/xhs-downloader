import type { BrowserTaskClaim } from "@xhs-downloader/contracts";

/** 浏览器写任务使用的合成请求参数。 */
export const WRITE_PAYLOAD = {
  feed_id: "synthetic-feed",
  xsec_token: "synthetic-token",
};

/** 浏览器写任务对应的合成详情页地址。 */
export const WRITE_URL =
  "https://www.xiaohongshu.com/explore/synthetic-feed?xsec_token=synthetic-token&xsec_source=pc_feed";

/** 创建一项不含真实账号和内容的浏览器任务声明。 */
export function makeBrowserTaskClaim(
  kind: BrowserTaskClaim["task"]["kind"] = "check_login_status",
  payload: BrowserTaskClaim["task"]["payload"] = {},
): BrowserTaskClaim {
  return {
    task: {
      task_id: "synthetic-task",
      request_id: "synthetic-request",
      kind,
      payload,
      status: "claimed",
      result: null,
      target_driver: "extension",
      executor_id: "synthetic-extension",
      extension_id: "synthetic-extension",
      lease_expires_at: "2026-01-01T00:05:00Z",
      attempts: 1,
      message: "扩展已领取",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    lease_token: "synthetic-lease-token-with-enough-length",
    lease_seconds: 30,
  };
}
