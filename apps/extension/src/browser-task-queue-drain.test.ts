import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runBrowserTaskPoll } from "./browser-task-runner";
import { makeBrowserTaskClaim } from "./browser-task-test-helpers";

beforeEach(() => {
  const values = {
    settings: { serviceUrl: "http://service", mode: "auto" },
    extensionCredential: {
      extensionId: "synthetic-extension",
      token: "synthetic-token",
      // 没有安装标识的旧凭据会被强制重新登记一次, 那是升级路径不是常态
      installationId: "synthetic-installation",
    },
  };
  vi.stubGlobal("chrome", {
    runtime: { id: "synthetic-extension" },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [
              key,
              values[key as keyof typeof values],
            ]),
          ),
        ),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    },
    tabs: {
      query: vi.fn(async () => [{ id: 7, active: true }]),
      sendMessage: vi.fn(async () => ({
        ok: true,
        message: "浏览器尚未登录小红书",
        result: { logged_in: false, user_id: null, nickname: null },
      })),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("浏览器任务队列排空", () => {
  it("首项长轮询成功后非阻塞继续领取排队任务", async () => {
    const first = makeBrowserTaskClaim();
    const second = makeBrowserTaskClaim();
    second.task.task_id = "synthetic-task-2";
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
      .mockResolvedValueOnce(new Response(JSON.stringify(first)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "running" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "succeeded" })))
      .mockResolvedValueOnce(new Response(JSON.stringify(second)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "running" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "succeeded" })))
      .mockResolvedValueOnce(new Response("null"));
    vi.stubGlobal("fetch", fetchMock);

    await runBrowserTaskPoll();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("wait_seconds=25");
    expect(fetchMock.mock.calls[4][0]).toContain("wait_seconds=0");
    expect(fetchMock.mock.calls[7][0]).toContain("wait_seconds=0");
  });

  it("运行态回传失败时绝不打开或操作小红书页面", async () => {
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
      .mockResolvedValueOnce(new Response(JSON.stringify(makeBrowserTaskClaim())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "任务租约已取消" }), {
          status: 409,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await runBrowserTaskPoll();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(chrome.tabs.query).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
