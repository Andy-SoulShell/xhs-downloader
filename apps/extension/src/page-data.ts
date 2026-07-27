import { parseInitialStateValue } from "./parser";

const INITIAL_STATE_PREFIX = "window.__INITIAL_STATE__";

/** 读取页面最后一份能够解析的小红书初始状态。 */
export function latestInitialState(page: Document): Record<string, unknown> {
  const scripts = [...page.scripts]
    .map((script) => script.textContent?.trim() ?? "")
    .filter((value) => value.startsWith(INITIAL_STATE_PREFIX))
    .reverse();
  for (const script of scripts) {
    try {
      return parseInitialStateValue(script);
    } catch {
      // 页面切换可能残留旧脚本，继续尝试较早的有效状态。
    }
  }
  throw new Error("当前页面没有可解析的小红书状态数据");
}

/** 将未知值安全收窄为普通对象。 */
export function dataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** 将未知值安全收窄为数组。 */
export function dataList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** 解包 Vue 响应式状态序列化后的 value 或 _value。 */
export function unwrapState(value: unknown): unknown {
  const object = dataRecord(value);
  if ("value" in object) return object.value;
  if ("_value" in object) return object._value;
  return value;
}

/** 将字符串或数值转换为界面文本。 */
export function dataText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** 将有限数值转换为非负整数，否则返回空值。 */
export function dataInteger(value: unknown): number | null {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? Math.trunc(result) : null;
}

/** 只接受真正的布尔值，其他输入使用给定默认值。 */
export function dataBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** 只保留 HTTP 或 HTTPS 地址，避免把任意页面文本作为资源地址。 */
export function dataUrl(value: unknown): string | null {
  const raw = dataText(value);
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
