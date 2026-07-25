import type {
  BrowserLoginState,
  BrowserTask,
  JsonValue,
} from "@xhs-downloader/contracts";

import { detectLoginState } from "./login-state";
import { parseFeedDetailDocument } from "./feed-detail-parser";
import { parseFeedListDocument } from "./feed-parser";
import { parseUserProfileDocument } from "./profile-parser";

/** 后台发送给小红书内容脚本的浏览器任务消息。 */
export interface BrowserPageTaskRequest {
  type: "browser-page-task";
  task: BrowserTask;
}

/** 内容脚本返回的结构化浏览器任务结果。 */
export interface BrowserPageTaskResponse {
  ok: boolean;
  message: string;
  result?: Record<string, JsonValue>;
  navigateUrl?: string;
}

/** 判断消息是否为内容脚本浏览器任务。 */
export function isBrowserPageTaskRequest(
  value: { type?: string },
): value is BrowserPageTaskRequest {
  return value.type === "browser-page-task";
}

/** 在当前页面执行一项已经过服务端授权的只读任务。 */
export async function executeBrowserPageTask(
  task: BrowserTask,
  page: Document,
  pageUrl: string,
): Promise<BrowserPageTaskResponse> {
  if (task.kind === "check_login_status") {
    const state: BrowserLoginState = detectLoginState(page, pageUrl);
    return {
      ok: true,
      message: state.logged_in ? "浏览器已登录小红书" : "浏览器尚未登录小红书",
      result: { ...state },
    };
  }
  if (task.kind === "list_feeds") {
    return success("推荐流读取完成", parseFeedListDocument(page, "home"));
  }
  if (task.kind === "search_feeds") {
    const keyword = payloadText(task, "keyword");
    assertDefaultSearchFilters(task);
    return success(
      "搜索结果读取完成",
      parseFeedListDocument(page, "search", keyword),
    );
  }
  if (task.kind === "get_feed_detail") {
    return success(
      "帖子详情读取完成",
      parseFeedDetailDocument(page, {
        feedId: payloadText(task, "feed_id"),
        xsecToken: payloadText(task, "xsec_token"),
        commentLimit: payloadNumber(task, "comment_limit"),
        includeReplies: task.payload.include_replies === true,
        replyLimit: payloadNumber(task, "reply_limit"),
      }),
    );
  }
  if (task.kind === "get_user_profile") {
    return success(
      "用户主页读取完成",
      parseUserProfileDocument(page, payloadText(task, "user_id")),
    );
  }
  if (task.kind === "get_my_profile") {
    if (new URL(pageUrl).pathname.includes("/user/profile/")) {
      return success(
        "当前账号主页读取完成",
        parseUserProfileDocument(page, null),
      );
    }
    const profileLink = page.querySelector<HTMLAnchorElement>(
      '.main-container .user a[href*="/user/profile/"]',
    );
    if (profileLink?.href) {
      return {
        ok: false,
        message: "正在打开当前账号主页",
        navigateUrl: profileLink.href,
      };
    }
    throw new Error("当前页面没有已登录账号的主页入口");
  }
  return {
    ok: false,
    message: `当前扩展版本尚不支持任务 ${task.kind}`,
  };
}

function success(
  message: string,
  result: object,
): BrowserPageTaskResponse {
  return {
    ok: true,
    message,
    result: result as Record<string, JsonValue>,
  };
}

function assertDefaultSearchFilters(task: BrowserTask): void {
  const filters = task.payload.filters;
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return;
  const defaults: Record<string, string> = {
    sort_by: "综合",
    note_type: "不限",
    publish_time: "不限",
    search_scope: "不限",
    location: "不限",
  };
  if (
    Object.entries(defaults).some(
      ([field, value]) => filters[field] !== value,
    )
  ) {
    throw new Error("当前扩展版本尚未接入搜索筛选交互");
  }
}

function payloadText(task: BrowserTask, field: string): string {
  const value = task.payload[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`浏览器任务缺少参数 ${field}`);
  }
  return value;
}

function payloadNumber(task: BrowserTask, field: string): number {
  const value = task.payload[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`浏览器任务参数 ${field} 无效`);
  }
  return value;
}
