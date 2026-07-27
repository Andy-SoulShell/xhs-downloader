import type { BrowserExtensionStatus, BrowserTask } from "@xhs-downloader/contracts";

import { API_BASE, parseResponse } from "./http";

/** 读取浏览器扩展登记与最近心跳。 */
export async function listBrowserExtensions(): Promise<BrowserExtensionStatus[]> {
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
  const response = await fetch(`${API_BASE}/browser/tasks/${encodeURIComponent(taskId)}/retry`, {
    method: "POST",
  });
  return parseResponse<BrowserTask>(response);
}

/**
 * 提交用户对结果不确定操作的核对结论。
 *
 * 确认已生效的记为完成；确认未生效的转为明确失败，随后才允许重试。
 */
export async function reviewBrowserTask(taskId: string, succeeded: boolean): Promise<BrowserTask> {
  const response = await fetch(`${API_BASE}/browser/tasks/${encodeURIComponent(taskId)}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: succeeded ? "succeeded" : "failed" }),
  });
  return parseResponse<BrowserTask>(response);
}

/** 注销一条扩展登记使其令牌立即失效；仍在运行的扩展会自动重新登记。 */
export async function revokeBrowserExtension(extensionId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/browser/extensions/${encodeURIComponent(extensionId)}`,
    { method: "DELETE" },
  );
  await parseResponse<void>(response);
}
