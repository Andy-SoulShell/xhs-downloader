const VERIFICATION_FRAME_SELECTOR = [
  "iframe[src*='captcha' i]",
  "iframe[src*='verify' i]",
  "iframe[src*='risk' i]",
  "iframe[title*='验证']",
].join(",");
const VERIFICATION_CONTAINER_SELECTOR = [
  "[role='dialog']",
  "[role='alert']",
  "[class*='captcha' i]",
  "[class*='verify' i]",
  "[class*='risk' i]",
].join(",");
const VERIFICATION_TEXT =
  /请完成.{0,8}(安全验证|扫码验证)|拖动.{0,8}滑块|扫码验证|操作频繁|环境异常/;

/**
 * 识别创作页当前可见且足够明确的安全验证阻塞。
 */
export function readPublicationVerification(root: ParentNode): string | undefined {
  const frame = root.querySelector<HTMLElement>(VERIFICATION_FRAME_SELECTOR);
  if (frame && isVisible(frame)) return "创作平台要求完成安全验证";
  const containers = root.querySelectorAll<HTMLElement>(VERIFICATION_CONTAINER_SELECTOR);
  for (const container of containers) {
    if (isVisible(container) && VERIFICATION_TEXT.test(normalizedText(container))) {
      return "创作平台要求完成安全验证";
    }
  }
  return undefined;
}

function isVisible(element: HTMLElement): boolean {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (
      current.hidden ||
      current.getAttribute("aria-hidden") === "true" ||
      current.style.display === "none" ||
      current.style.visibility === "hidden"
    ) {
      return false;
    }
  }
  return true;
}

function normalizedText(element: HTMLElement): string {
  return (element.innerText || element.textContent || "").replace(/\s+/g, "").slice(0, 300);
}
