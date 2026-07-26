import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { typePublicationSchedule } from "./publication-input";

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

describe("官方定时可信输入", () => {
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

  it("填写后的定时时间与目标不一致时报错并释放会话", async () => {
    mocks.sendCommand.mockImplementation(async (_target, method, params) => {
      if (method !== "Runtime.evaluate") return undefined;
      // 页面把输入规整成了另一个时间，不能当作填写成功。
      return String(params.expression).includes("input.value")
        ? { result: { value: { ok: true, value: "2026-07-25 16:00" } } }
        : { result: { value: { ok: true } } };
    });

    await expect(
      typePublicationSchedule(
        42,
        "2026-07-25 16:42",
        "https://creator.xiaohongshu.com/publish/publish",
      ),
    ).rejects.toThrow("未能确认");
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 42 });
  });

  it("定时输入控件不可用时给出桥接文案", async () => {
    mocks.sendCommand.mockImplementation(async (_target, method) =>
      method === "Runtime.evaluate"
        ? { result: { value: { ok: false, message: "找不到定时输入框" } } }
        : undefined,
    );

    await expect(
      typePublicationSchedule(
        42,
        "2026-07-25 16:42",
        "https://creator.xiaohongshu.com/publish/publish",
      ),
    ).rejects.toThrow("找不到定时输入框");
  });

  it("桥接未给出失败原因时使用固定文案", async () => {
    mocks.sendCommand.mockImplementation(async (_target, method) =>
      method === "Runtime.evaluate" ? { result: { value: {} } } : undefined,
    );

    await expect(
      typePublicationSchedule(
        42,
        "2026-07-25 16:42",
        "https://creator.xiaohongshu.com/publish/publish",
      ),
    ).rejects.toThrow("创作平台输入控件不可用");
  });
});
