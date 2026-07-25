import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserTaskUnauthorizedError,
  claimBrowserTask,
  registerBrowserExtension,
  reportBrowserTaskResult,
  reportBrowserTaskRunning,
  supportsBrowserTasks,
} from "./browser-task-service";

const credential = {
  extensionId: "synthetic-extension",
  token: "synthetic-token",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("浏览器任务服务客户端", () => {
  it("只接受声明通用任务能力的新版服务", async () => {
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
        new Response(
          JSON.stringify({
            protocol_version: 3,
            features: { browser_tasks: true },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(supportsBrowserTasks("http://service/")).resolves.toBe(true);
    await expect(supportsBrowserTasks("http://service")).resolves.toBe(false);
    await expect(supportsBrowserTasks("http://service")).resolves.toBe(false);
    await expect(supportsBrowserTasks("http://service")).resolves.toBe(false);
  });

  it("登记、领取并回传任务状态与结果", async () => {
    const claim = { task: { task_id: "task" }, lease_token: "lease" };
    const task = { task_id: "task", status: "running" };
    const done = { task_id: "task", status: "succeeded" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "issued-token" })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(claim)))
      .mockResolvedValueOnce(new Response(JSON.stringify(task)))
      .mockResolvedValueOnce(new Response(JSON.stringify(done)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      registerBrowserExtension("http://service", "extension"),
    ).resolves.toEqual({
      extensionId: "extension",
      token: "issued-token",
    });
    await expect(
      claimBrowserTask("http://service", credential),
    ).resolves.toEqual(claim);
    await expect(
      reportBrowserTaskRunning(
        "http://service",
        credential,
        "task",
        "lease",
      ),
    ).resolves.toEqual(task);
    await expect(
      reportBrowserTaskResult(
        "http://service",
        credential,
        "task",
        "lease",
        "succeeded",
        "检查完成",
        { logged_in: false },
      ),
    ).resolves.toEqual(done);
    expect(fetchMock.mock.calls[2][1].headers).toMatchObject({
      Authorization: "Bearer synthetic-token",
      "X-Browser-Lease": "lease",
    });
  });

  it("区分缺失令牌、未授权和服务端错误", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({})))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "合成错误" }), { status: 400 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      registerBrowserExtension("http://service", "extension"),
    ).rejects.toThrow("没有返回扩展能力令牌");
    await expect(
      claimBrowserTask("http://service", credential),
    ).rejects.toBeInstanceOf(BrowserTaskUnauthorizedError);
    await expect(
      claimBrowserTask("http://service", credential),
    ).rejects.toThrow("合成错误");
  });
});
