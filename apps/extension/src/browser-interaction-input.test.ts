import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeBrowserTaskInteraction,
  handleBrowserInteractionRequest,
  isBrowserInteractionRequest,
  requestBrowserInteraction,
} from "./browser-interaction-input";

const mocks = vi.hoisted(() => ({
  attach: vi.fn(async () => undefined),
  detach: vi.fn(async () => undefined),
  sendCommand: vi.fn(async (_target: unknown, method: string) =>
    method === "Runtime.evaluate"
      ? { result: { value: { ok: true, x: 80, y: 60 } } }
      : undefined,
  ),
  sendMessage: vi.fn(async () => ({ ok: true, message: "已触发" })),
  query: vi.fn(async () => [{ id: 7 }]),
  update: vi.fn(async () => undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("chrome", {
    debugger: {
      attach: mocks.attach,
      detach: mocks.detach,
      sendCommand: mocks.sendCommand,
    },
    runtime: { sendMessage: mocks.sendMessage },
    tabs: { query: mocks.query, update: mocks.update },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("浏览器互动可信输入", () => {
  it("仅为已授权任务发送可信鼠标点击", async () => {
    const revoke = authorizeBrowserTaskInteraction(
      42,
      "synthetic-task",
      "set_favorite",
    );

    await expect(
      handleBrowserInteractionRequest(
        {
          type: "browser-interaction-activate",
          taskId: "synthetic-task",
          kind: "favorite",
        },
        42,
        "https://www.xiaohongshu.com/explore/synthetic-feed",
      ),
    ).resolves.toEqual({ ok: true, message: "已通过受控输入触发互动" });

    expect(mocks.attach).toHaveBeenCalledWith({ tabId: 42 }, "1.3");
    expect(mocks.sendCommand.mock.calls.map((call) => call[1])).toEqual([
      "Page.bringToFront",
      "Runtime.evaluate",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
    ]);
    expect(mocks.sendCommand).toHaveBeenLastCalledWith(
      { tabId: 42 },
      "Input.dispatchMouseEvent",
      expect.objectContaining({
        button: "left",
        buttons: 0,
        type: "mouseReleased",
        x: 80,
        y: 60,
      }),
    );
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 42 });
    expect(mocks.update).toHaveBeenCalledWith(7, { active: true });
    revoke();
  });

  it("拒绝错误任务、非详情页和不可见控件", async () => {
    const revoke = authorizeBrowserTaskInteraction(
      43,
      "synthetic-task",
      "set_like",
    );
    await expect(
      handleBrowserInteractionRequest(
        {
          type: "browser-interaction-activate",
          taskId: "other-task",
          kind: "like",
        },
        43,
        "https://www.xiaohongshu.com/explore/synthetic-feed",
      ),
    ).rejects.toThrow("授权无效");
    await expect(
      handleBrowserInteractionRequest(
        {
          type: "browser-interaction-activate",
          taskId: "synthetic-task",
          kind: "like",
        },
        43,
        "https://www.xiaohongshu.com/search_result",
      ),
    ).rejects.toThrow("帖子详情页");

    mocks.sendCommand.mockImplementation(async (_target, method) =>
      method === "Runtime.evaluate"
        ? {
            result: {
              value: { ok: false, x: 0, y: 0, message: "按钮不可见" },
            },
          }
        : undefined,
    );
    await expect(
      handleBrowserInteractionRequest(
        {
          type: "browser-interaction-activate",
          taskId: "synthetic-task",
          kind: "like",
        },
        43,
        "https://www.xiaohongshu.com/explore/synthetic-feed",
      ),
    ).rejects.toThrow("按钮不可见");
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 43 });
    revoke();
  });

  it("内容脚本发送类型化请求并透传后台失败", async () => {
    expect(
      isBrowserInteractionRequest({
        type: "browser-interaction-activate",
      }),
    ).toBe(true);
    expect(isBrowserInteractionRequest({ type: "other" })).toBe(false);

    await requestBrowserInteraction("synthetic-task", "favorite");
    expect(mocks.sendMessage).toHaveBeenCalledWith({
      type: "browser-interaction-activate",
      taskId: "synthetic-task",
      kind: "favorite",
    });

    mocks.sendMessage.mockResolvedValueOnce({
      ok: false,
      message: "模拟拒绝",
    });
    await expect(
      requestBrowserInteraction("synthetic-task", "like"),
    ).rejects.toThrow("模拟拒绝");
  });

  it("非互动任务不会创建授权", async () => {
    const revoke = authorizeBrowserTaskInteraction(
      44,
      "synthetic-task",
      "list_feeds",
    );
    await expect(
      handleBrowserInteractionRequest(
        {
          type: "browser-interaction-activate",
          taskId: "synthetic-task",
          kind: "favorite",
        },
        44,
        "https://www.xiaohongshu.com/explore/synthetic-feed",
      ),
    ).rejects.toThrow("授权无效");
    revoke();
  });
});
