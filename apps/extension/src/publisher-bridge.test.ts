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
    let scrolled = false;
    button.scrollIntoView = vi.fn(() => {
      scrolled = true;
    });
    vi.spyOn(button, "getBoundingClientRect").mockImplementation(() =>
      scrolled
        ? {
            bottom: 140,
            height: 40,
            left: 100,
            right: 220,
            top: 100,
            width: 120,
            x: 100,
            y: 100,
            toJSON: () => ({}),
          }
        : {
            bottom: 840,
            height: 40,
            left: 100,
            right: 220,
            top: 800,
            width: 120,
            x: 100,
            y: 800,
            toJSON: () => ({}),
          },
    );
    root.append(button);
    document.body.append(control);
    const locate = (
      globalThis as Record<
        symbol,
        ((action?: "locate" | "prepare" | "activate") => unknown) | undefined
      >
    )[Symbol.for("xhs-downloader.publisher-control")];

    expect(locate?.()).toEqual({
      ok: true,
      message: "已聚焦创作平台发布按钮",
      x: 160,
      y: 120,
    });
    expect(root.activeElement).toBe(button);
    expect(button.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
      inline: "center",
    });
    expect(locate?.("prepare")).toEqual({
      ok: true,
      message: "创作平台发布按钮已准备",
    });
    const click = vi.spyOn(button, "click");
    expect(locate?.("activate")).toEqual({
      ok: true,
      message: "已通过创作页内部按钮提交发布",
    });
    expect(click).toHaveBeenCalledOnce();
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
