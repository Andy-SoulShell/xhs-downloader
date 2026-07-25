import type { JsonValue } from "@xhs-downloader/contracts";

import type { BrowserTask } from "./types";
import { API_BASE, parseResponse } from "./http";

/** 浏览能力完成后的任务与类型化结果。 */
export interface BrowserOperationResult<T> {
  task: BrowserTask;
  data: T;
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
