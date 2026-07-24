import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { schedulePublicationTabClose } from "./publication-tab";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("chrome", {
    tabs: { remove: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("发布页生命周期", () => {
  it("确认发布成功后延迟关闭当前标签", async () => {
    schedulePublicationTabClose(42);

    await vi.advanceTimersByTimeAsync(800);

    expect(chrome.tabs.remove).toHaveBeenCalledWith(42);
  });
});
