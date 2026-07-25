import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrowserTaskLeaseLostError,
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
    const claim = {
      task: { task_id: "task", target_driver: "extension" },
      lease_token: "lease",
    };
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
    expect(fetchMock.mock.calls[1][0]).toBe(
      "http://service/browser/extension/tasks/claim?wait_seconds=25",
    );
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

  it("只把租约冲突识别为租约丢失，不吞掉结果校验错误", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "任务租约已经过期" }), {
          status: 409,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "任务结果结构无效" }), {
          status: 400,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      reportBrowserTaskRunning(
        "http://service",
        credential,
        "task",
        "stale-lease",
      ),
    ).rejects.toBeInstanceOf(BrowserTaskLeaseLostError);
    const validationError = await reportBrowserTaskResult(
      "http://service",
      credential,
      "task",
      "valid-lease",
      "succeeded",
      "检查完成",
      { logged_in: "invalid" },
    ).catch((error: unknown) => error);
    expect(validationError).toBeInstanceOf(Error);
    expect((validationError as Error).message).toContain("任务结果结构无效");
    expect(validationError).not.toBeInstanceOf(
      BrowserTaskLeaseLostError,
    );
  });

  it.each([-0.01, 30.01, Number.NaN])(
    "拒绝越界的领取等待时间 %s",
    async (waitSeconds) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        claimBrowserTask("http://service", credential, waitSeconds),
      ).rejects.toThrow("必须在 0 到 30 秒之间");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("拒绝执行服务端误发的受管浏览器任务", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            task: { task_id: "task", target_driver: "managed" },
            lease_token: "lease",
          }),
        ),
      ),
    );

    await expect(
      claimBrowserTask("http://service", credential),
    ).rejects.toThrow("不属于扩展");
  });
});
