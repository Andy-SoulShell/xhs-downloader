import type {
  BrowserLoginState,
  BrowserTask,
  JsonValue,
} from "@xhs-downloader/contracts";

import { detectLoginState } from "./login-state";

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
}

/** 判断消息是否为内容脚本浏览器任务。 */
export function isBrowserPageTaskRequest(
  value: { type?: string },
): value is BrowserPageTaskRequest {
  return value.type === "browser-page-task";
}

/** 在当前页面执行一项已经过服务端授权的只读任务。 */
export function executeBrowserPageTask(
  task: BrowserTask,
  page: Document,
  pageUrl: string,
): BrowserPageTaskResponse {
  if (task.kind === "check_login_status") {
    const state: BrowserLoginState = detectLoginState(page, pageUrl);
    return {
      ok: true,
      message: state.logged_in ? "浏览器已登录小红书" : "浏览器尚未登录小红书",
      result: { ...state },
    };
  }
  return {
    ok: false,
    message: `当前扩展版本尚不支持任务 ${task.kind}`,
  };
}
