import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserTaskClaim } from "@xhs-downloader/contracts";

import { runBrowserTaskPoll } from "./browser-task-runner";

function qrCodeClaim(): BrowserTaskClaim {
  return {
    task: {
      task_id: "synthetic-task",
      request_id: "synthetic-request",
      kind: "get_login_qrcode",
      payload: {},
      status: "claimed",
      result: null,
      target_driver: "extension",
      executor_id: "synthetic-extension",
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
          )),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    },
    tabs: {
      query: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 8, active: false })),
      update: vi.fn(async () => ({ id: 8, active: false })),
      remove: vi.fn(async () => undefined),
      sendMessage: vi.fn(async () => ({
        ok: true,
        message: "登录二维码已生成，登录页面将保持打开",
        result: {
          is_logged_in: false,
          image_data_url: "data:image/png;base64,c3ludGhldGljLXFy",
          expires_at: "2026-01-01T00:04:00Z",
          consumed: false,
        },
      })),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("登录二维码后台任务", () => {
  it("在前台返回二维码并保留登录标签完成扫码握手", async () => {
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
      .mockResolvedValueOnce(new Response(JSON.stringify(qrCodeClaim())))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "running" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "succeeded" })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await runBrowserTaskPoll();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://www.xiaohongshu.com/explore/",
      active: true,
    });
    expect(chrome.tabs.remove).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toMatchObject({
      status: "succeeded",
      result: { is_logged_in: false },
    });
  });
});
