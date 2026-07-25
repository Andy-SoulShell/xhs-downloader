import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserTaskClaim } from "@xhs-downloader/contracts";

import { runBrowserTaskPoll } from "./browser-task-runner";

let values: Record<string, unknown>;
let tabs: Array<{ id?: number; active?: boolean }>;
let pageResponse: unknown;

function claim(): BrowserTaskClaim {
  return {
    task: {
      task_id: "synthetic-task",
      request_id: "synthetic-request",
      kind: "check_login_status",
      payload: {},
      status: "claimed",
      result: null,
      extension_id: "synthetic-extension",
      lease_expires_at: "2026-01-01T00:05:00Z",
      attempts: 1,
      message: "扩展已领取",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    lease_token: "synthetic-lease-token-with-enough-length",
  };
}

beforeEach(() => {
  values = {
    settings: { serviceUrl: "http://service", mode: "auto" },
    extensionCredential: {
      extensionId: "synthetic-extension",
      token: "synthetic-token",
    },
  };
  tabs = [{ id: 7, active: true }];
  pageResponse = {
    ok: true,
    message: "浏览器尚未登录小红书",
    result: { logged_in: false, user_id: null, nickname: null },
  };
  vi.stubGlobal("chrome", {
    runtime: { id: "synthetic-extension" },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [
              key,
              values[key],
            ]),
          ),
        ),
        set: vi.fn(async (next: Record<string, unknown>) => {
          Object.assign(values, next);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete values[key];
          }
        }),
      },
    },
    tabs: {
      query: vi.fn(async () => tabs),
      create: vi.fn(async () => ({ id: 8, active: false })),
      sendMessage: vi.fn(async () => pageResponse),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("浏览器任务后台执行器", () => {
  it("领取任务、在现有页面执行并回传成功结果", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 3,
            features: { browser_tasks: true },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(claim())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "running" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "succeeded" })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await runBrowserTaskPoll();

    expect(chrome.tabs.query).toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ type: "browser-page-task" }),
    );
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toMatchObject({
      status: "succeeded",
      result: { logged_in: false },
    });
  });

  it("队列为空时不创建页面", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 3,
            features: { browser_tasks: true },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response("null"));
    vi.stubGlobal("fetch", fetchMock);

    await runBrowserTaskPoll();

    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });

  it("没有现成页面时创建后台标签并回传明确失败", async () => {
    tabs = [];
    pageResponse = { ok: false, message: "模拟不支持的任务" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 3,
            features: { browser_tasks: true },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(claim())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "running" })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "failed" })));
    vi.stubGlobal("fetch", fetchMock);

    await runBrowserTaskPoll();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://www.xiaohongshu.com/explore/",
      active: false,
    });
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).status).toBe("failed");
  });
});
