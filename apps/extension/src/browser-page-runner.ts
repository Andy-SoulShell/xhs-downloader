import type {
  BrowserLoginState,
  BrowserTask,
  JsonValue,
} from "@xhs-downloader/contracts";

import { detectLoginState } from "./login-state";
import { readLiveInitialState } from "./browser-state-bridge";
import {
  loadComments,
  needsCommentLoading,
} from "./comment-loader";
import { postComment, replyComment } from "./comment-runner";
import { parseFeedDetailDocument } from "./feed-detail-parser";
import { parseFeedListDocument } from "./feed-parser";
import { setDesiredInteraction } from "./interaction-runner";
import { parseUserProfileDocument } from "./profile-parser";
import {
  applySearchFilters,
  hasCustomSearchFilters,
} from "./search-filters";
import { buildPageCompatibilityDiagnostics } from "./browser-page-diagnostics";

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
  status?: "succeeded" | "failed" | "needs_review";
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
    const filters = payloadRecord(task, "filters");
    let currentState: Record<string, unknown> | undefined;
    if (hasCustomSearchFilters(filters)) {
      await applySearchFilters(page, filters);
      currentState = await readLiveInitialState(page);
    }
    return success(
      "搜索结果读取完成",
      parseFeedListDocument(page, "search", keyword, currentState),
    );
  }
  if (task.kind === "get_feed_detail") {
    const options = {
      feedId: payloadText(task, "feed_id"),
      xsecToken: payloadText(task, "xsec_token"),
      commentLimit: payloadNumber(task, "comment_limit"),
      includeReplies: task.payload.include_replies === true,
      replyLimit: payloadNumber(task, "reply_limit"),
    };
    let currentState: Record<string, unknown> | undefined;
    if (needsCommentLoading(options)) {
      await loadComments(page, options);
      currentState = await readLiveInitialState(page);
    }
    return success(
      "帖子详情读取完成",
      parseFeedDetailDocument(page, options, currentState),
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
  if (task.kind === "set_like" || task.kind === "set_favorite") {
    const active = payloadBoolean(task, "active");
    return success(
      active ? "互动状态已启用" : "互动状态已取消",
      await setDesiredInteraction(
        page,
        payloadText(task, "feed_id"),
        task.kind === "set_like" ? "like" : "favorite",
        active,
      ),
    );
  }
  if (task.kind === "post_comment") {
    return success(
      "评论已提交并确认",
      await postComment(
        page,
        payloadText(task, "feed_id"),
        payloadText(task, "content"),
      ),
    );
  }
  if (task.kind === "reply_comment") {
    return success(
      "回复已提交并确认",
      await replyComment(
        page,
        payloadText(task, "feed_id"),
        payloadText(task, "content"),
        {
          commentId: payloadOptionalText(task, "comment_id"),
          userId: payloadOptionalText(task, "user_id"),
        },
      ),
    );
  }
  return {
    ok: false,
    message: `当前扩展版本尚不支持任务 ${task.kind}`,
    result: buildPageCompatibilityDiagnostics(page, pageUrl),
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

function payloadText(task: BrowserTask, field: string): string {
  const value = task.payload[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`浏览器任务缺少参数 ${field}`);
  }
  return value;
}

function payloadRecord(
  task: BrowserTask,
  field: string,
): Record<string, JsonValue> {
  const value = task.payload[field];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function payloadNumber(task: BrowserTask, field: string): number {
  const value = task.payload[field];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`浏览器任务参数 ${field} 无效`);
  }
  return value;
}

function payloadBoolean(task: BrowserTask, field: string): boolean {
  const value = task.payload[field];
  if (typeof value !== "boolean") {
    throw new Error(`浏览器任务参数 ${field} 无效`);
  }
  return value;
}

function payloadOptionalText(
  task: BrowserTask,
  field: string,
): string | null {
  const value = task.payload[field];
  return typeof value === "string" && value ? value : null;
}
