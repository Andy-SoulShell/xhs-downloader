const PUBLISH_CONTROL = "xhs-publish-btn";
const BRIDGE = Symbol.for("xhs-downloader.publisher-control");

type BridgeScope = typeof globalThis & {
  [BRIDGE]?: () => PublicationControlLocation;
};

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
  scope[BRIDGE] = () => locateCapturedControl(roots);
  return () => {
    Element.prototype.attachShadow = originalAttachShadow;
    if (previous) scope[BRIDGE] = previous;
    else delete scope[BRIDGE];
  };
}

interface PublicationControlLocation {
  ok: boolean;
  message: string;
}

function locateCapturedControl(
  roots: WeakMap<Element, ShadowRoot>,
): PublicationControlLocation {
  const control = document.querySelector<HTMLElement>(PUBLISH_CONTROL);
  if (
    control?.getAttribute("is-publish") !== "true" ||
    control.getAttribute("submit-disabled") === "true" ||
    control.getAttribute("submit-loading") === "true"
  ) {
    return { ok: false, message: "创作平台发布控件不可用" };
  }
  const label = control.getAttribute("submit-text") || "发布";
  const button = [...(roots.get(control)?.querySelectorAll("button") ?? [])]
    .find((item) => !item.disabled && item.textContent?.trim() === label);
  if (!button) return { ok: false, message: "无法访问创作平台发布按钮" };
  const rect = button.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { ok: false, message: "创作平台发布按钮当前不可见" };
  }
  button.focus();
  return {
    ok: true,
    message: "已聚焦创作平台发布按钮",
  };
}
