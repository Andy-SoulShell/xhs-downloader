import type { BrowserLoginState } from "@xhs-downloader/contracts";

import { parseInitialStateValue } from "./parser";

const USER_CHANNEL_SELECTOR = ".main-container .user .link-wrapper .channel";
const LOGIN_SELECTOR = ".login-container, [class*='login-container']";
const INITIAL_STATE_PREFIX = "window.__INITIAL_STATE__";

/** 从已加载的小红书页面判断登录状态并读取最小账号信息。 */
export function detectLoginState(
  page: Document,
  pageUrl: string,
): BrowserLoginState {
  const user = readCurrentUser(page);
  const hasUserChannel = Boolean(page.querySelector(USER_CHANNEL_SELECTOR));
  const loginVisible =
    new URL(pageUrl).pathname.includes("login") ||
    Boolean(page.querySelector(LOGIN_SELECTOR));
  const loggedIn = Boolean(user && !user.guest) || hasUserChannel;
  return {
    logged_in: loggedIn && !loginVisible,
    user_id: loggedIn ? text(user?.userId ?? user?.user_id) || null : null,
    nickname: loggedIn ? text(user?.nickname ?? user?.nickName) || null : null,
  };
}

function readCurrentUser(page: Document): Record<string, unknown> | undefined {
  const scripts = [...page.scripts]
    .map((script) => script.textContent?.trim() ?? "")
    .filter((value) => value.startsWith(INITIAL_STATE_PREFIX))
    .reverse();
  for (const script of scripts) {
    try {
      const state = object(parseInitialStateValue(script));
      const user = object(state.user);
      const rawInfo = object(user.userInfo);
      const info = object(rawInfo.value ?? rawInfo);
      if (Object.keys(info).length) return info;
    } catch {
      // 页面可能保留旧脚本；继续尝试较早的有效状态。
    }
  }
  return undefined;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}
