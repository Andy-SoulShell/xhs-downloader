import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteCookies,
  executeBrowserOperation,
  executeReadCapability,
} from "./browser-api";

function task(status: string, result: Record<string, unknown> | null) {
  return {
    task_id: "synthetic-browser-task",
    request_id: "synthetic-request",
    kind: "list_feeds",
    payload: {},
    status,
    result,
    target_driver: "extension",
    executor_id: "synthetic-extension",
    extension_id: "synthetic-extension",
    lease_expires_at: null,
    attempts: 1,
    message: status === "failed" ? "合成读取失败" : "合成状态",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("浏览器能力 API 客户端", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("同步返回只读结果与完整路由轨迹", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { items: [], source: "home" },
          route: {
            provider: "http",
            strategy: "http_first",
            browser_driver: null,
            fallback_used: false,
            fallback_reason: null,
            attempted_providers: ["http"],
            account_consistency: null,
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "synthetic-read-request" });

    const result = await executeReadCapability<{ items: [] }>(
      "/xhs/feeds/list",
      {},
    );

    expect(result).toMatchObject({
      data: { items: [] },
      route: { provider: "http", attempted_providers: ["http"] },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/xhs/feeds/list",
      expect.objectContaining({
        body: JSON.stringify({ request_id: "synthetic-read-request" }),
      }),
    );
  });

  it("提交登录任务并返回终态结果", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          task("succeeded", {
            logged_in: true,
            user_id: null,
            nickname: null,
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "synthetic-request" });

    const result = await executeBrowserOperation<{ logged_in: boolean }>(
      "/xhs/login/status",
      {},
    );

    expect(result.data.logged_in).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/xhs/login/status?wait_seconds=60",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ request_id: "synthetic-request" }),
      }),
    );
  });

  it.each([
    [task("failed", null), "合成读取失败"],
    [task("queued", null), "尚未完成任务"],
    [task("succeeded", null), "尚未完成任务"],
  ])("把非成功任务转换为明确错误", async (payload, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))),
    );

    await expect(
      executeBrowserOperation("/xhs/login/status", {}),
    ).rejects.toThrow(message);
  });

  it("显式确认后清理指定 Cookie 会话", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          target: "browser",
          status: "succeeded",
          deleted: true,
          message: "浏览器 Cookie 已清除",
          task_id: "synthetic-delete-task",
          restart_required: false,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: () => "synthetic-delete-request" });

    await expect(deleteCookies("browser")).resolves.toMatchObject({
      deleted: true,
      target: "browser",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/xhs/login/cookies/delete?wait_seconds=60",
      expect.objectContaining({
        body: JSON.stringify({
          target: "browser",
          confirmed: true,
          request_id: "synthetic-delete-request",
        }),
      }),
    );
  });

  it("把 Cookie 清理中的非终态转换为明确错误", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            target: "browser",
            status: "queued",
            deleted: false,
            message: "等待扩展",
            task_id: "synthetic-delete-task",
            restart_required: false,
          }),
        ),
      ),
    );

    await expect(deleteCookies("browser")).rejects.toThrow(
      "尚未完成 Cookie 清理",
    );
  });
});
