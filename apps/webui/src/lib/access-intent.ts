import type { BrowserDriver, RouteStrategy, SettingsValues } from "./types";

/** 用户实际关心的使用方式，而不是内部的路由与执行器组合。 */
export type AccessIntent = "extension" | "managed" | "custom";

/** 一种使用方式对应的配置组合。 */
interface IntentPreset {
  route_strategy: RouteStrategy;
  browser_driver: BrowserDriver;
}

const PRESETS: Record<Exclude<AccessIntent, "custom">, IntentPreset> = {
  // 已装扩展：复用用户当前浏览器的登录态，读写都走扩展。
  extension: { route_strategy: "browser_only", browser_driver: "extension" },
  // 不想装扩展：用程序自带的专用浏览器，登录态留在独立配置目录。
  managed: { route_strategy: "browser_only", browser_driver: "managed" },
};

/**
 * 由当前配置推断用户选择的使用方式。
 *
 * 配置组合不属于任何预设时返回 `custom`，此时界面保留用户的手工组合，
 * 不会在展示时把它改写成某个预设。
 *
 * @param values 当前配置。
 * @returns 匹配的使用方式。
 */
export function detectAccessIntent(values: SettingsValues): AccessIntent {
  for (const [intent, preset] of Object.entries(PRESETS)) {
    if (
      values.route_strategy === preset.route_strategy &&
      values.browser_driver === preset.browser_driver
    ) {
      return intent as AccessIntent;
    }
  }
  return "custom";
}

/**
 * 取得某种使用方式对应的配置组合。
 *
 * @param intent 目标使用方式。
 * @returns 需要写入的配置；`custom` 表示保持当前配置不变。
 */
export function presetForIntent(intent: AccessIntent): IntentPreset | null {
  return intent === "custom" ? null : PRESETS[intent];
}
