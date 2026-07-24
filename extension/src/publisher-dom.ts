export type PublicationMediaKind = "image" | "video";
const CUSTOM_PUBLISH_CONTROL = "xhs-publish-btn";

const TITLE_SELECTORS = [
  "input[placeholder*='标题']",
  "textarea[placeholder*='标题']",
  "[contenteditable='true'][data-placeholder*='标题']",
];
const BODY_SELECTORS = [
  "textarea[placeholder*='正文']",
  "textarea[placeholder*='描述']",
  "textarea[placeholder*='内容']",
  "[contenteditable='true'][data-placeholder*='正文']",
  "[contenteditable='true'][data-placeholder*='描述']",
  ".ProseMirror[contenteditable='true']",
  ".ql-editor[contenteditable='true']",
];

export function choosePublicationMode(
  root: ParentNode,
  kind: PublicationMediaKind,
): void {
  const labels =
    kind === "video" ? ["上传视频", "视频笔记"] : ["上传图文", "图文笔记"];
  const candidates = root.querySelectorAll<HTMLElement>(
    "button, [role='tab'], [role='button'], [class*='tab'], [class*='upload']",
  );
  const target = [...candidates].find((element) =>
    labels.some((label) => normalizedText(element).includes(label)),
  );
  target?.click();
}

export async function waitForUploadInput(
  root: ParentNode,
  kind: PublicationMediaKind,
  timeout = 30_000,
): Promise<HTMLInputElement> {
  return waitForValue(() => {
    const inputs = [...root.querySelectorAll<HTMLInputElement>("input[type=file]")];
    return inputs.find((input) => acceptsKind(input.accept, kind));
  }, timeout, "没有找到创作页素材上传入口");
}

export function attachFiles(input: HTMLInputElement, files: File[]): void {
  const transfer = new DataTransfer();
  for (const file of files) transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export async function fillPublicationForm(
  root: ParentNode,
  title: string,
  body: string,
  timeout = 60_000,
): Promise<void> {
  const titleEditor = await waitForValue(
    () => queryFirst<HTMLElement>(root, TITLE_SELECTORS),
    timeout,
    "素材上传后没有找到标题输入框",
  );
  const bodyEditor = await waitForValue(
    () => queryFirst<HTMLElement>(root, BODY_SELECTORS),
    timeout,
    "素材上传后没有找到正文编辑器",
  );
  setEditorValue(titleEditor, title);
  setEditorValue(bodyEditor, body);
}

export async function waitForPublishControl(
  root: ParentNode,
  timeout = 90_000,
): Promise<HTMLElement> {
  return waitForValue(() => {
    const custom = root.querySelector<HTMLElement>(CUSTOM_PUBLISH_CONTROL);
    if (
      custom?.getAttribute("is-publish") === "true" &&
      custom.getAttribute("submit-disabled") !== "true" &&
      custom.getAttribute("submit-loading") !== "true"
    ) {
      return custom;
    }
    const buttons = [...root.querySelectorAll<HTMLButtonElement>("button")];
    return buttons.find((button) => {
      const text = normalizedText(button);
      return (
        !button.disabled &&
        (text === "发布" || text === "发布笔记" || text === "立即发布")
      );
    });
  }, timeout, "没有找到可用的发布按钮");
}

export function isCustomPublishControl(control: HTMLElement): boolean {
  return control.localName === CUSTOM_PUBLISH_CONTROL;
}

export function activateNativePublishControl(control: HTMLElement): void {
  control.click();
}

export function readPublishOutcome(
  root: ParentNode,
  pathname: string,
): { status: "published" | "failed"; message: string } | undefined {
  if (/success|published/i.test(pathname)) {
    return { status: "published", message: "创作平台已确认发布成功" };
  }
  const notices = root.querySelectorAll<HTMLElement>(
    "[role='alert'], [role='status'], .toast, .message, .notification",
  );
  for (const notice of notices) {
    const text = normalizedText(notice);
    if (/发布成功|提交成功|作品已发布/.test(text)) {
      return { status: "published", message: text };
    }
    if (/发布失败|提交失败|请重试|发生错误/.test(text)) {
      return { status: "failed", message: text };
    }
  }
  return undefined;
}

export async function waitForPublishOutcome(
  root: ParentNode,
  getPathname: () => string,
  timeout = 120_000,
): Promise<{ status: "published" | "failed"; message: string }> {
  return waitForValue(
    () => readPublishOutcome(root, getPathname()),
    timeout,
    "发布结果未能确认",
  );
}

function setEditorValue(element: HTMLElement, value: string): void {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
  } else {
    element.focus();
    element.textContent = value;
  }
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: value,
      inputType: "insertText",
    }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function queryFirst<T extends Element>(
  root: ParentNode,
  selectors: string[],
): T | undefined {
  for (const selector of selectors) {
    const result = root.querySelector<T>(selector);
    if (result) return result;
  }
  return undefined;
}

function acceptsKind(accept: string, kind: PublicationMediaKind): boolean {
  const value = accept.toLowerCase();
  const extensions =
    kind === "video"
      ? [".mp4", ".mov", ".webm"]
      : [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".avif"];
  return (
    !value ||
    value.includes(`${kind}/`) ||
    value.includes(kind) ||
    extensions.some((extension) => value.includes(extension))
  );
}

function normalizedText(element: HTMLElement): string {
  return (element.innerText || element.textContent || "").replace(/\s+/g, "");
}

async function waitForValue<T>(
  read: () => T | undefined,
  timeout: number,
  timeoutMessage: string,
): Promise<T> {
  const immediate = read();
  if (immediate !== undefined) return immediate;
  return new Promise<T>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const value = read();
      if (value === undefined) return;
      cleanup();
      resolve(value);
    });
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, timeout);
    const cleanup = () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
}
