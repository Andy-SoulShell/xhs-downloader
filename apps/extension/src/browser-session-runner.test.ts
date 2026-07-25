import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrowserTask } from "@xhs-downloader/contracts";

import { executeBrowserSessionTask } from "./browser-session-runner";

function task(
  kind: BrowserTask["kind"],
  payload: BrowserTask["payload"] = {},
): BrowserTask {
  return {
    task_id: "synthetic-task",
    request_id: null,
    kind,
    payload,
    status: "claimed",
    result: null,
    target_driver: "extension",
    executor_id: "synthetic-extension",
    extension_id: "synthetic-extension",
    lease_expires_at: "2026-01-01T00:05:00Z",
    attempts: 1,
    message: "模拟任务",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("浏览器会话任务执行器", () => {
  it("忽略需要页面执行的任务", async () => {
    await expect(
      executeBrowserSessionTask(task("check_login_status")),
    ).resolves.toBeUndefined();
  });

  it("未明确确认时拒绝清除 Cookie", async () => {
    await expect(
      executeBrowserSessionTask(task("delete_cookies")),
    ).rejects.toThrow("必须明确确认");
  });

  it("只清除小红书站点 Cookie", async () => {
    const remove = vi.fn(async () => undefined);
    vi.stubGlobal("chrome", { browsingData: { remove } });

    await expect(
      executeBrowserSessionTask(
        task("delete_cookies", { confirmed: true }),
      ),
    ).resolves.toEqual({
      ok: true,
      message: "浏览器中的小红书 Cookie 已清除",
      result: { target: "browser", deleted: true },
    });
    expect(remove).toHaveBeenCalledWith(
      {
        origins: [
          "https://www.xiaohongshu.com",
          "https://creator.xiaohongshu.com",
        ],
      },
      { cookies: true },
    );
  });
});
