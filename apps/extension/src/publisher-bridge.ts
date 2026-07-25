const PUBLISH_CONTROL = "xhs-publish-btn";
const BRIDGE = Symbol.for("xhs-downloader.publisher-control");

type BridgeScope = typeof globalThis & {
  [BRIDGE]?: (action?: PublicationControlAction) => PublicationControlLocation;
};

type PublicationControlAction = "locate" | "prepare" | "activate";

export function installPublisherBridge(): () => void {
  const roots = new WeakMap<Element, ShadowRoot>();
  const originalAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (
    init: ShadowRootInit,
  ): ShadowRoot {
    const root = originalAttachShadow.call(this, init);
    if (this.localName === PUBLISH_CONTROL) roots.set(this, root);
    return root;
  };

  const scope = globalThis as BridgeScope;
  const previous = scope[BRIDGE];
  scope[BRIDGE] = (action = "locate") =>
    accessCapturedControl(roots, action);
  return () => {
    Element.prototype.attachShadow = originalAttachShadow;
    if (previous) scope[BRIDGE] = previous;
    else delete scope[BRIDGE];
  };
}

interface PublicationControlLocation {
  ok: boolean;
  message: string;
  x?: number;
  y?: number;
}

function accessCapturedControl(
  roots: WeakMap<Element, ShadowRoot>,
  action: PublicationControlAction,
): PublicationControlLocation {
  const control = document.querySelector<HTMLElement>(PUBLISH_CONTROL);
  if (control?.getAttribute("is-publish") !== "true") {
    return { ok: false, message: "创作平台发布控件不可用" };
  }
  const submitting =
    control.getAttribute("submit-disabled") === "true" ||
    control.getAttribute("submit-loading") === "true";
  if (submitting && action === "activate") {
    return { ok: true, message: "创作平台已经进入提交状态" };
  }
  if (submitting) return { ok: false, message: "创作平台发布控件不可用" };
  const label = control.getAttribute("submit-text") || "发布";
  const button = [...(roots.get(control)?.querySelectorAll("button") ?? [])]
    .find((item) => !item.disabled && item.textContent?.trim() === label);
  if (!button) return { ok: false, message: "无法访问创作平台发布按钮" };
  if (action === "activate") {
    button.click();
    return { ok: true, message: "已通过创作页内部按钮提交发布" };
  }
  button.scrollIntoView({ block: "center", inline: "center" });
  button.focus({ preventScroll: true });
  if (action === "prepare") {
    return { ok: true, message: "创作平台发布按钮已准备" };
  }
  const rect = button.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { ok: false, message: "创作平台发布按钮当前不可见" };
  }
  return {
    ok: true,
    message: "已聚焦创作平台发布按钮",
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}
