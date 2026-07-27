import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runBrowserTaskPoll } from "./browser-task-runner";
import {
  makeBrowserTaskClaim as claim,
  WRITE_PAYLOAD,
  WRITE_URL,
} from "./browser-task-test-helpers";

let values: Record<string, unknown>;
let tabs: Array<{ id?: number; active?: boolean }>;
let pageResponse: unknown;

beforeEach(() => {
  values = {
    settings: { serviceUrl: "http://service", mode: "auto" },
    extensionCredential: {
      extensionId: "synthetic-extension",
      token: "synthetic-token",
      // 没有安装标识的旧凭据会被强制重新登记一次, 那是升级路径不是常态
      installationId: "synthetic-installation",
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
      update: vi.fn(async () => ({ id: 8, active: false })),
      get: vi.fn(async () => ({
        id: 8,
        status: "complete",
        url: "https://www.xiaohongshu.com/user/profile/synthetic-user/?source=redirect",
      })),
      remove: vi.fn(async () => undefined),
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
            protocol_version: 4,
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
    expect(fetchMock.mock.calls[1][0]).toContain("wait_seconds=25");
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
            protocol_version: 4,
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
            protocol_version: 4,
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

  it.each([
    [
      "search_feeds" as const,
      { keyword: "合成 关键词" },
      "https://www.xiaohongshu.com/search_result?keyword=%E5%90%88%E6%88%90%20%E5%85%B3%E9%94%AE%E8%AF%8D&source=web_explore_feed",
    ],
    [
      "get_user_profile" as const,
      { user_id: "synthetic/user", xsec_token: "token value" },
      "https://www.xiaohongshu.com/user/profile/synthetic%2Fuser?xsec_token=token%20value&xsec_source=pc_note",
    ],
    [
      "get_feed_detail" as const,
      { feed_id: "synthetic/feed", xsec_token: "token value" },
      "https://www.xiaohongshu.com/explore/synthetic%2Ffeed?xsec_token=token%20value&xsec_source=pc_feed",
    ],
    [
      "get_my_profile" as const,
      {},
      "https://www.xiaohongshu.com/explore/",
    ],
    [
      "set_like" as const,
      { ...WRITE_PAYLOAD, active: true },
      WRITE_URL,
    ],
    [
      "set_favorite" as const,
      { ...WRITE_PAYLOAD, active: false },
      WRITE_URL,
    ],
    [
      "post_comment" as const,
      { ...WRITE_PAYLOAD, content: "合成评论" },
      WRITE_URL,
    ],
    [
      "reply_comment" as const,
      {
        ...WRITE_PAYLOAD,
        content: "合成回复",
        comment_id: "synthetic-comment",
      },
      WRITE_URL,
    ],
  ])("为 %s 创建隔离的后台任务页面", async (kind, payload, url) => {
    if (kind === "set_like") {
      pageResponse = {
        ok: false,
        status: "needs_review",
        message: "点赞结果需要人工核对",
      };
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 4,
            features: { browser_tasks: true },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(claim(kind, payload))))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "running" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "succeeded" })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await runBrowserTaskPoll();

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url, active: false });
    expect(chrome.tabs.remove).toHaveBeenCalledWith(8);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).status).toBe(
      kind === "set_like" ? "needs_review" : "succeeded",
    );
  });

  it("跟随页面返回的站内地址后重新读取当前账号主页", async () => {
    const responses = [
      {
        ok: false,
        message: "正在打开当前账号主页",
        navigateUrl:
          "https://www.xiaohongshu.com/user/profile/synthetic-user",
      },
      {
        ok: true,
        message: "当前账号主页读取完成",
        result: { user_id: "synthetic-user" },
      },
    ];
    vi.mocked(chrome.tabs.sendMessage).mockImplementation(
      async () => responses.shift(),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 4,
            features: { browser_tasks: true },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(claim("get_my_profile"))),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "running" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "succeeded" })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await runBrowserTaskPoll();

    expect(chrome.tabs.update).toHaveBeenCalledWith(8, {
      url: "https://www.xiaohongshu.com/user/profile/synthetic-user",
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });
});
