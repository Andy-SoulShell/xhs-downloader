import type {
  BrowserExtensionStatus,
  BrowserTask,
} from "@xhs-downloader/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listBrowserExtensions,
  listBrowserTasks,
  retryBrowserTask,
} from "./browser-management-api";

afterEach(() => vi.unstubAllGlobals());

describe("浏览器管理 API 客户端", () => {
  it("读取扩展、任务并重试明确失败的任务", async () => {
    const extension: BrowserExtensionStatus = {
      extension_id: "synthetic-extension",
      registered_at: "2026-01-01T00:00:00Z",
      last_seen_at: "2026-01-01T00:00:01Z",
      online: true,
    };
    const task: BrowserTask = {
      task_id: "synthetic-task",
      request_id: null,
      kind: "get_feed_detail",
      payload: {},
      status: "failed",
      result: null,
      extension_id: "synthetic-extension",
      lease_expires_at: null,
      attempts: 1,
      message: "合成失败",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([extension])))
      .mockResolvedValueOnce(new Response(JSON.stringify([task])))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...task, status: "queued" })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listBrowserExtensions()).resolves.toEqual([extension]);
    await expect(listBrowserTasks(8)).resolves.toEqual([task]);
    await expect(retryBrowserTask(task.task_id)).resolves.toMatchObject({
      status: "queued",
    });
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/browser/extensions",
      "/api/browser/tasks?limit=8",
      "/api/browser/tasks/synthetic-task/retry",
    ]);
    expect(fetchMock.mock.calls[2][1]).toEqual({ method: "POST" });
  });
});
