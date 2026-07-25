import { describe, expect, it } from "vitest";

import type { BrowserTask } from "@xhs-downloader/contracts";

import {
  executeBrowserPageTask,
  isBrowserPageTaskRequest,
} from "./browser-page-runner";

function task(kind: BrowserTask["kind"]): BrowserTask {
  return {
    task_id: "synthetic-task",
    request_id: null,
    kind,
    payload: {},
    status: "claimed",
    result: null,
    extension_id: "synthetic-extension",
    lease_expires_at: "2026-01-01T00:00:00Z",
    attempts: 1,
    message: "模拟任务",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("内容脚本浏览器任务执行器", () => {
  it("执行登录状态任务并返回结构化结果", () => {
    const page = document.implementation.createHTMLDocument();
    page.body.innerHTML =
      '<div class="main-container"><div class="user"><a class="link-wrapper"><i class="channel"></i></a></div></div>';

    const response = executeBrowserPageTask(
      task("check_login_status"),
      page,
      "https://www.xiaohongshu.com/explore",
    );

    expect(response.ok).toBe(true);
    expect(response.result).toEqual({
      logged_in: true,
      user_id: null,
      nickname: null,
    });
  });

  it("明确拒绝尚未接入的任务类型", () => {
    const page = document.implementation.createHTMLDocument();
    const response = executeBrowserPageTask(
      task("search_feeds"),
      page,
      "https://www.xiaohongshu.com/explore",
    );

    expect(response.ok).toBe(false);
    expect(response.message).toContain("search_feeds");
    expect(isBrowserPageTaskRequest({ type: "browser-page-task" })).toBe(true);
    expect(isBrowserPageTaskRequest({ type: "download" })).toBe(false);
  });
});
