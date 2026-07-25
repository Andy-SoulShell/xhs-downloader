import type { JsonValue } from "@xhs-downloader/contracts";

import type { BrowserTask, BrowserTaskStatus } from "./types";
import { API_BASE, parseResponse } from "./http";

/** 浏览能力完成后的任务与类型化结果。 */
export interface BrowserOperationResult<T> {
  task: BrowserTask;
  data: T;
}

/** Cookie 清理后的目标会话状态。 */
export interface CookieDeletionResult {
  target: "browser" | "http";
  status: BrowserTaskStatus;
  deleted: boolean;
  message: string;
  task_id: string | null;
  restart_required: boolean;
}

/** 通过本机 API 提交并等待一项浏览器能力任务。 */
export async function executeBrowserOperation<T>(
  path: string,
  payload: Record<string, JsonValue>,
  signal?: AbortSignal,
): Promise<BrowserOperationResult<T>> {
  const response = await fetch(`${API_BASE}${path}?wait_seconds=60`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      request_id: crypto.randomUUID(),
    }),
    signal,
  });
  const task = await parseResponse<BrowserTask>(response);
  if (task.status === "succeeded" && task.result) {
    return { task, data: task.result as T };
  }
  if (task.status === "failed" || task.status === "needs_review") {
    throw new Error(task.message);
  }
  throw new Error(`浏览器扩展尚未完成任务 ${task.task_id.slice(0, 8)}`);
}

/** 显式确认后清理指定登录会话的 Cookie。 */
export async function deleteCookies(
  target: "browser" | "http",
  signal?: AbortSignal,
): Promise<CookieDeletionResult> {
  const response = await fetch(
    `${API_BASE}/xhs/login/cookies/delete?wait_seconds=60`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target,
        confirmed: true,
        request_id: crypto.randomUUID(),
      }),
      signal,
    },
  );
  const result = await parseResponse<CookieDeletionResult>(response);
  if (result.status === "succeeded" && result.deleted) return result;
  if (result.status === "failed" || result.status === "needs_review") {
    throw new Error(result.message);
  }
  throw new Error(
    `浏览器扩展尚未完成 Cookie 清理${result.task_id ? ` ${result.task_id.slice(0, 8)}` : ""}`,
  );
}
