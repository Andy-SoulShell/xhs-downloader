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

  it("控件已在提交中时激活视为成功而定位仍拒绝", () => {
    const restore = installPublisherBridge();
    const control = document.createElement("xhs-publish-btn");
    control.setAttribute("is-publish", "true");
    control.setAttribute("submit-loading", "true");
    document.body.append(control);
    const bridge = readBridge();

    // 已进入提交状态时重复点击会造成重复发布，只能确认而不能再次激活。
    expect(bridge?.("activate")).toEqual({
      ok: true,
      message: "创作平台已经进入提交状态",
    });
    expect(bridge?.("locate")).toEqual({
      ok: false,
      message: "创作平台发布控件不可用",
    });
    restore();
  });

  it("按钮被禁用或文案不符时拒绝访问", () => {
    const restore = installPublisherBridge();
    const control = document.createElement("xhs-publish-btn");
    control.setAttribute("is-publish", "true");
    control.setAttribute("submit-text", "发布");
    const root = control.attachShadow({ mode: "closed" });
    const disabled = document.createElement("button");
    disabled.textContent = "发布";
    disabled.disabled = true;
    const mismatched = document.createElement("button");
    mismatched.textContent = "存草稿";
    root.append(disabled, mismatched);
    document.body.append(control);

    expect(readBridge()?.("activate")).toEqual({
      ok: false,
      message: "无法访问创作平台发布按钮",
    });
    restore();
  });

  it("按钮尺寸为零时拒绝返回坐标", () => {
    const restore = installPublisherBridge();
    const control = document.createElement("xhs-publish-btn");
    control.setAttribute("is-publish", "true");
    control.setAttribute("submit-text", "发布");
    const root = control.attachShadow({ mode: "closed" });
    const button = document.createElement("button");
    button.textContent = "发布";
    button.scrollIntoView = vi.fn();
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    root.append(button);
    document.body.append(control);

    expect(readBridge()?.("locate")).toEqual({
      ok: false,
      message: "创作平台发布按钮当前不可见",
    });
    restore();
  });

  it("卸载后恢复原始 attachShadow 并移除桥接", () => {
    const original = Element.prototype.attachShadow;
    const restore = installPublisherBridge();

    expect(Element.prototype.attachShadow).not.toBe(original);
    expect(readBridge()).toBeTypeOf("function");

    restore();

    expect(Element.prototype.attachShadow).toBe(original);
    expect(readBridge()).toBeUndefined();
  });

  it("重复安装后卸载会还原此前的桥接", () => {
    const first = installPublisherBridge();
    const firstBridge = readBridge();
    const second = installPublisherBridge();

    expect(readBridge()).not.toBe(firstBridge);

    second();

    expect(readBridge()).toBe(firstBridge);
    first();
  });

  it("非发布控件的影子根不会被记录", () => {
    const restore = installPublisherBridge();
    const other = document.createElement("div");
    const otherRoot = other.attachShadow({ mode: "open" });
    otherRoot.append(document.createElement("button"));
    document.body.append(other);

    const control = document.createElement("xhs-publish-btn");
    control.setAttribute("is-publish", "true");
    control.setAttribute("submit-text", "发布");
    document.body.append(control);

    expect(readBridge()?.("locate")).toEqual({
      ok: false,
      message: "无法访问创作平台发布按钮",
    });
    restore();
  });
});

function readBridge():
  | ((action?: "locate" | "prepare" | "activate") => unknown)
  | undefined {
  return (
    globalThis as Record<
      symbol,
      ((action?: "locate" | "prepare" | "activate") => unknown) | undefined
    >
  )[Symbol.for("xhs-downloader.publisher-control")];
}
