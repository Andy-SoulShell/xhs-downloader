import type { PublicationMediaKind } from "./publisher-dom";

const STATUS_SELECTOR = [
  "[role='alert']",
  "[role='status']",
  "[class*='upload']",
  "[class*='progress']",
  "[class*='video']",
].join(",");
const FORM_SELECTOR = [
  "input[placeholder*='标题']",
  "textarea[placeholder*='标题']",
  "[contenteditable='true'][data-placeholder*='标题']",
].join(",");
const FAILURE_PATTERN = /上传失败|处理失败|转码失败|视频损坏|格式不支持/;
const PENDING_PATTERN = /上传中|正在上传|处理中|正在处理|转码中|正在转码/;

/**
 * 等待视频上传和平台转码完成，避免在素材尚未就绪时提交。
 */
export async function waitForMediaReady(
  root: ParentNode,
  kind: PublicationMediaKind,
  timeout = 10 * 60_000,
): Promise<void> {
  if (kind === "image") return;
  await waitForValue(() => readMediaState(root), timeout);
}

function readMediaState(root: ParentNode): true | undefined {
  const statuses = [...root.querySelectorAll<HTMLElement>(STATUS_SELECTOR)].filter(isVisible);
  const failure = statuses.map(normalizedText).find((text) => FAILURE_PATTERN.test(text));
  if (failure) throw new Error(`视频素材处理失败：${failure}`);
  const pending = statuses.some((element) => PENDING_PATTERN.test(normalizedText(element)));
  return root.querySelector(FORM_SELECTOR) && !pending ? true : undefined;
}

function isVisible(element: HTMLElement): boolean {
  return (
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    element.style.display !== "none" &&
    element.style.visibility !== "hidden"
  );
}

function normalizedText(element: HTMLElement): string {
  return (element.innerText || element.textContent || "").replace(/\s+/g, "").slice(0, 200);
}

async function waitForValue(read: () => true | undefined, timeout: number): Promise<void> {
  const immediate = read();
  if (immediate) return;
  return new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(check);
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("视频上传或平台处理超时，请在创作平台核对素材状态"));
    }, timeout);
    function cleanup(): void {
      window.clearTimeout(timer);
      observer.disconnect();
    }
    function check(): void {
      try {
        if (!read()) return;
        cleanup();
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    }
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
}
