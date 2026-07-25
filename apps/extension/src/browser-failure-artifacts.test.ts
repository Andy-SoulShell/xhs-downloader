import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { captureRedactedFailure } from "./browser-failure-artifacts";

const mocks = vi.hoisted(() => ({
  attach: vi.fn(async () => undefined),
  detach: vi.fn(async () => undefined),
  get: vi.fn(async () => ({
    browserFailureArtifacts: [
      {
        taskId: "old-task",
        createdAt: "2026-01-01T00:00:00Z",
        screenshot: "data:image/jpeg;base64,b2xk",
        diagnostics: {},
      },
    ],
  })),
  set: vi.fn(async () => undefined),
  sendCommand: vi.fn(
    async (
      _target: unknown,
      method: string,
      _params?: Record<string, unknown>,
    ) =>
      method === "Page.captureScreenshot"
        ? { data: "c3ludGhldGljLXJlZGFjdGVk" }
        : {},
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("chrome", {
    debugger: {
      attach: mocks.attach,
      detach: mocks.detach,
      sendCommand: mocks.sendCommand,
    },
    storage: {
      local: {
        get: mocks.get,
        set: mocks.set,
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("浏览任务失败证据", () => {
  it("截图前隐藏文本与媒体，并仅在扩展本地保留两份", async () => {
    const summary = await captureRedactedFailure(42, "synthetic-task", {
      adapter_version: "synthetic-adapter",
    });

    expect(summary).toMatchObject({ redacted_screenshot_saved: true });
    const expressions = mocks.sendCommand.mock.calls
      .filter((call) => call[1] === "Runtime.evaluate")
      .map((call) => String(call[2]?.expression));
    expect(expressions[0]).toContain("color: transparent");
    expect(expressions[0]).toContain("visibility: hidden");
    expect(expressions.at(-1)).toContain("xhd-failure-redaction");
    expect(mocks.set).toHaveBeenCalledWith({
      browserFailureArtifacts: [
        expect.objectContaining({
          taskId: "synthetic-task",
          screenshot:
            "data:image/jpeg;base64,c3ludGhldGljLXJlZGFjdGVk",
        }),
        expect.objectContaining({ taskId: "old-task" }),
      ],
    });
    expect(mocks.detach).toHaveBeenCalledWith({ tabId: 42 });
  });

  it("调试器不可用时不影响原始失败处理", async () => {
    mocks.attach.mockRejectedValueOnce(new Error("unavailable"));

    await expect(
      captureRedactedFailure(42, "synthetic-task"),
    ).resolves.toBeUndefined();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
