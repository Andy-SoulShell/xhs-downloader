import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkHealth,
  deleteCollectedPost,
  getSettings,
  listClientRecords,
  listCollectedPosts,
  listTasks,
  retryTask,
  submitDetail,
  submitTask,
  updateSettings,
} from "./api";
import { makeSettingsResponse } from "../test/fixtures";

describe("API 客户端", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("识别可用的后端服务", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkHealth()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("/api/health", {
      signal: undefined,
    });
  });

  it.each([
    new Response(null, { status: 503 }),
    new Error("network unavailable"),
  ])("把不可用或异常的健康检查转为空状态", async (outcome) => {
    const fetchMock =
      outcome instanceof Error
        ? vi.fn().mockRejectedValue(outcome)
        : vi.fn().mockResolvedValue(outcome);
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkHealth()).resolves.toBe(false);
  });

  it("提交结构化下载请求并返回结果", async () => {
    const payload = {
      message: "作品文件下载完成",
      data: null,
      files: [],
      skipped: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitDetail({
        url: "https://example.invalid/work",
        download: true,
        index: [1],
      }),
    ).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/xhs/detail",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("优先显示后端返回的错误信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "链接无效" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      submitDetail({ url: "invalid", download: false }),
    ).rejects.toThrow("链接无效");
  });

  it("在错误响应不是 JSON 时保留状态码", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("broken", { status: 500 })),
    );

    await expect(
      submitDetail({ url: "invalid", download: false }),
    ).rejects.toThrow("HTTP 500");
  });

  it("提交、筛选并重试后台任务", async () => {
    const task = { task_id: "synthetic-task", status: "queued" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(task)))
      .mockResolvedValueOnce(new Response(JSON.stringify([task])))
      .mockResolvedValueOnce(new Response(JSON.stringify(task)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitTask({
        url: "https://example.invalid/work",
        index: [1],
        force: false,
        request_id: "synthetic-request",
      }),
    ).resolves.toEqual(task);
    await expect(listTasks("queued")).resolves.toEqual([task]);
    await expect(retryTask("synthetic-task")).resolves.toEqual(task);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/tasks",
      "/api/tasks?status=queued",
      "/api/tasks/synthetic-task/retry",
    ]);
  });

  it("读取扩展独立下载记录", async () => {
    const records = [{ record_id: "synthetic-record" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(records))),
    );

    await expect(listClientRecords()).resolves.toEqual(records);
  });

  it("读取并删除采集帖子", async () => {
    const posts = [{ 作品ID: "synthetic-work" }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(posts)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCollectedPosts()).resolves.toEqual(posts);
    await expect(deleteCollectedPost("synthetic/work")).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/posts",
      "/api/posts/synthetic%2Fwork",
    ]);
  });

  it("读取并更新本地服务配置", async () => {
    const settings = makeSettingsResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(settings)))
      .mockResolvedValueOnce(new Response(JSON.stringify(settings)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSettings()).resolves.toEqual(settings);
    await expect(updateSettings(settings.values)).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(settings.values),
      }),
    );
  });

  it("显示 FastAPI detail 错误信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "仅允许本机访问" }), {
          status: 403,
        }),
      ),
    );

    await expect(getSettings()).rejects.toThrow("仅允许本机访问");
  });
});
