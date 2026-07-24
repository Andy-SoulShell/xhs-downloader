import { afterEach, describe, expect, it, vi } from "vitest";

import { installPublisherBridge } from "./publisher-bridge";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("创作页主世界按钮桥接", () => {
  it("记录封闭影子根并聚焦内部发布按钮", () => {
    const restore = installPublisherBridge();
    const control = document.createElement("xhs-publish-btn");
    control.setAttribute("is-publish", "true");
    control.setAttribute("submit-disabled", "false");
    control.setAttribute("submit-loading", "false");
    control.setAttribute("submit-text", "发布");
    const root = control.attachShadow({ mode: "closed" });
    const button = document.createElement("button");
    button.textContent = "发布";
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      bottom: 140,
      height: 40,
      left: 100,
      right: 220,
      top: 100,
      width: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });
    root.append(button);
    document.body.append(control);
    const locate = (
      globalThis as Record<symbol, (() => unknown) | undefined>
    )[Symbol.for("xhs-downloader.publisher-control")];

    expect(locate?.()).toEqual({
      ok: true,
      message: "已聚焦创作平台发布按钮",
    });
    expect(root.activeElement).toBe(button);
    restore();
  });

  it("发布控件不可用时返回明确错误且不触发点击", () => {
    const restore = installPublisherBridge();
    const locate = (
      globalThis as Record<symbol, (() => unknown) | undefined>
    )[Symbol.for("xhs-downloader.publisher-control")];

    expect(locate?.()).toEqual({
      ok: false,
      message: "创作平台发布控件不可用",
    });
    restore();
  });
});
