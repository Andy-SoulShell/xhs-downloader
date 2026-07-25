import type {
  BrowserExtensionStatus,
  BrowserTask,
} from "@xhs-downloader/contracts";

import { API_BASE, parseResponse } from "./http";

/** 读取浏览器扩展登记与最近心跳。 */
export async function listBrowserExtensions(): Promise<
  BrowserExtensionStatus[]
> {
  const response = await fetch(`${API_BASE}/browser/extensions`);
  return parseResponse<BrowserExtensionStatus[]>(response);
}

/** 读取最近浏览器任务，用于本机操作审计。 */
export async function listBrowserTasks(limit = 20): Promise<BrowserTask[]> {
  const response = await fetch(`${API_BASE}/browser/tasks?limit=${limit}`);
  return parseResponse<BrowserTask[]>(response);
}

/** 重新排队一项明确失败且允许重试的浏览器任务。 */
export async function retryBrowserTask(taskId: string): Promise<BrowserTask> {
  const response = await fetch(
    `${API_BASE}/browser/tasks/${encodeURIComponent(taskId)}/retry`,
    { method: "POST" },
  );
  return parseResponse<BrowserTask>(response);
}
