import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activatePublicationControl,
  typePublicationSchedule,
} from "./publication-input";

const mocks = vi.hoisted(() => ({
  attach: vi.fn(async () => undefined),
  detach: vi.fn(async () => undefined),
  sendCommand: vi.fn(
    async (
      _target: unknown,
      _method: string,
      _params: Record<string, unknown>,
    ): Promise<object | undefined> => undefined,
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendCommand.mockImplementation(async (_target, method, params) => {
    if (method !== "Runtime.evaluate") return undefined;
    return String(params.expression).includes("path:location.pathname")
      ? {
          result: {
            value: {
              path: "/publish/publish",
              result: { ok: true, message: "已提交" },
            },
          },
        }
      : { result: { value: { ok: true, x: 160, y: 120 } } };
  });
  vi.stubGlobal("chrome", {
    debugger: {
      attach: mocks.attach,
      detach: mocks.detach,
      sendCommand: mocks.sendCommand,
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("创作页可信输入", () => {
  it("仅在创作发布页发送可信鼠标点击并立即释放调试会话", async () => {
    await activatePublicationControl(
      42,
      "https://creator.xiaohongshu.com/publish/publish",
    );

    expect(mocks.attach).toHaveBeenCalledWith({ tabId: 42 }, "1.3");
    expect(mocks.sendCommand).toHaveBeenNthCalledWith(
      4,
      { tabId: 42 },
      "Input.dispatchMouseEvent",
      {
        button: "none",
        buttons: 0,
        clickCount: 0,
        pointerType: "mouse",
        type: "mouseMoved",
        x: 160,
        y: 120,
      },
    );
    expect(mocks.sendCommand).toHaveBeenNthCalledWith(
      5,
      { tabId: 42 },
      "Input.dispatchMouseEvent",
      {
        button: "left",
        buttons: 1,
        clickCount: 1,
        pointerType: "mouse",
        type: "mousePressed",
        x: 160,
        y: 120,
      },
    );
    expect(mocks.sendCommand).toHaveBeenNthCalledWith(
      6,
      { tabId: 42 },
      "Input.dispatchMouseEvent",
      {
        button: "left",
        buttons: 0,
        clickCount: 1,
        pointerType: "mouse",
        type: "mouseReleased",
        x: 160,
        y: 120,
      },
    );
    expect(mocks.sendCommand.mock.calls.map((call) => call[1])).toEqual([
      "Page.bringToFront",
      "Runtime.evaluate",
      "Runtime.evaluate",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Input.dispatchMouseEvent",
      "Runtime.evaluate",
    ]);
    expect(mocks.sendCommand).toHaveBeenLastCalledWith(
      { tabId: 42 },
      "Runtime.evaluate",
      {
        expression: expect.stringContaining("('activate')"),
        returnByValue: true,
        userGesture: true,
      },
    );
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 42 });
  });

  it("浏览器拒绝鼠标输入时仍释放调试会话", async () => {
    mocks.sendCommand.mockImplementation(async (_target, method) => {
      if (method === "Runtime.evaluate") {
        return { result: { value: { ok: true, x: 160, y: 120 } } };
      }
      if (method === "Input.dispatchMouseEvent") {
        throw new Error("mouse unavailable");
      }
      return undefined;
    });
    await expect(
      activatePublicationControl(
        42,
        "https://creator.xiaohongshu.com/publish/publish",
      ),
    ).rejects.toThrow("mouse unavailable");
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 42 });
  });

  it("拒绝不可用控件和非创作页标签", async () => {
    mocks.sendCommand.mockImplementation(async (_target, method) =>
      method === "Runtime.evaluate"
        ? { result: { value: { ok: false, message: "控件不可用" } } }
        : undefined,
    );
    await expect(
      activatePublicationControl(
        42,
        "https://creator.xiaohongshu.com/publish/publish",
      ),
    ).rejects.toThrow("控件不可用");
    await expect(
      activatePublicationControl(42, "https://example.com/publish/"),
    ).rejects.toThrow("只能在小红书");
    expect(mocks.attach).toHaveBeenCalledOnce();
  });

  it("拒绝缺少按钮坐标的桥接结果", async () => {
    mocks.sendCommand.mockImplementation(async (_target, method) =>
      method === "Runtime.evaluate"
        ? { result: { value: { ok: true } } }
        : undefined,
    );

    await expect(
      activatePublicationControl(
        42,
        "https://creator.xiaohongshu.com/publish/publish",
      ),
    ).rejects.toThrow("没有可用坐标");
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 42 });
  });

  it("通过可信文本输入填写并确认官方定时时间", async () => {
    mocks.sendCommand.mockImplementation(async (_target, method, params) => {
      if (method !== "Runtime.evaluate") return undefined;
      return String(params.expression).includes("input.value")
        ? { result: { value: { ok: true, value: "2026-07-25 16:42" } } }
        : { result: { value: { ok: true } } };
    });

    await typePublicationSchedule(
      42,
      "2026-07-25 16:42",
      "https://creator.xiaohongshu.com/publish/publish",
    );

    expect(mocks.sendCommand).toHaveBeenCalledWith(
      { tabId: 42 },
      "Input.insertText",
      { text: "2026-07-25 16:42" },
    );
    expect(mocks.sendCommand).toHaveBeenCalledWith(
      { tabId: 42 },
      "Input.dispatchKeyEvent",
      expect.objectContaining({ key: "Tab", type: "keyDown" }),
    );
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 42 });
  });

  it("拒绝非法定时时间且不附加调试会话", async () => {
    await expect(
      typePublicationSchedule(
        42,
        "tomorrow",
        "https://creator.xiaohongshu.com/publish/publish",
      ),
    ).rejects.toThrow("格式无效");
    expect(mocks.attach).not.toHaveBeenCalled();
  });
});
