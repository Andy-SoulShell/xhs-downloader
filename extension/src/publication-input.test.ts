import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activatePublicationControl } from "./publication-input";

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
  mocks.sendCommand.mockImplementation(async (_target, method) =>
    method === "Runtime.evaluate"
      ? { result: { value: { ok: true } } }
      : undefined,
  );
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
  it("仅在创作发布页发送可信回车并立即释放调试会话", async () => {
    await activatePublicationControl(
      42,
      "https://creator.xiaohongshu.com/publish/publish",
    );

    expect(mocks.attach).toHaveBeenCalledWith({ tabId: 42 }, "1.3");
    expect(mocks.sendCommand).toHaveBeenNthCalledWith(
      3,
      { tabId: 42 },
      "Input.dispatchKeyEvent",
      {
        code: "Enter",
        key: "Enter",
        nativeVirtualKeyCode: 13,
        type: "rawKeyDown",
        windowsVirtualKeyCode: 13,
      },
    );
    expect(mocks.sendCommand.mock.calls.map((call) => call[1])).toEqual([
      "Page.bringToFront",
      "Runtime.evaluate",
      "Input.dispatchKeyEvent",
      "Input.dispatchKeyEvent",
    ]);
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 42 });
  });

  it("浏览器拒绝键盘输入时仍释放调试会话", async () => {
    mocks.sendCommand.mockImplementation(async (_target, method) => {
      if (method === "Runtime.evaluate") {
        return { result: { value: { ok: true } } };
      }
      if (method === "Input.dispatchKeyEvent") {
        throw new Error("keyboard unavailable");
      }
      return undefined;
    });
    await expect(
      activatePublicationControl(
        42,
        "https://creator.xiaohongshu.com/publish/publish",
      ),
    ).rejects.toThrow("keyboard unavailable");
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
});
