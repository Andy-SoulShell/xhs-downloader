/** 本地服务连不上时的统一提示。 */
export const SERVICE_UNREACHABLE_MESSAGE =
  "连接不上本地服务，请确认它还在运行，然后重试。";

/**
 * 消息本身就是写给用户看的错误，涵盖服务端返回的提示与本地校验结论。
 *
 * 用类型而非文本特征来区分：运行时异常的原文也可能夹带中文（例如
 * `Cannot read properties of undefined (reading '媒体')`），靠猜会把
 * 前端缺陷当成正经提示原样弹给用户。
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * 各浏览器在网络层失败时给出的原文，用于识别“根本没连上”这一类错误。
 *
 * Chromium 为 `Failed to fetch`，Safari 为 `Load failed`，
 * Firefox 为 `NetworkError when attempting to fetch resource`。
 */
const NETWORK_FAILURE_HINTS = [
  "failed to fetch",
  "load failed",
  "networkerror",
  "network request failed",
];

/**
 * 把任意异常转换成可以直接展示给用户的中文提示。
 *
 * 后端经 `parseResponse` 抛出的消息本身就是中文，直接透出；浏览器在网络层
 * 抛出的是英文原生错误，必须换成能指导用户行动的说法，不能原样展示。
 *
 * @param error 捕获到的异常。
 * @param fallback 无法归类时使用的中文兜底文案。
 * @returns 面向用户的中文提示。
 */
export function describeError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const text = error.message.trim();
  if (!text) return fallback;
  if (error instanceof UserFacingError) return text;
  // 只认这些特征串。读取空值之类的普通代码错误同样是 TypeError，
  // 一律当成网络故障会把真正的缺陷伪装成“服务没开”。
  const lowered = text.toLowerCase();
  if (NETWORK_FAILURE_HINTS.some((hint) => lowered.includes(hint))) {
    return SERVICE_UNREACHABLE_MESSAGE;
  }
  return fallback;
}
