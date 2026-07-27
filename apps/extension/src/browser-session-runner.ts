import type { BrowserTask } from "@xhs-downloader/contracts";

import type { BrowserPageTaskResponse } from "./browser-page-runner";

const XHS_ORIGINS: [string, ...string[]] = [
  "https://www.xiaohongshu.com",
  "https://creator.xiaohongshu.com",
];

/** 执行不依赖页面内容脚本的浏览器会话任务。 */
export async function executeBrowserSessionTask(
  task: BrowserTask,
): Promise<BrowserPageTaskResponse | undefined> {
  if (task.kind !== "delete_cookies") return undefined;
  if (task.payload.confirmed !== true) {
    throw new Error("清除浏览器 Cookie 前必须明确确认");
  }
  await chrome.browsingData.remove({ origins: XHS_ORIGINS }, { cookies: true });
  return {
    ok: true,
    message: "浏览器中的小红书 Cookie 已清除",
    result: { target: "browser", deleted: true },
  };
}
