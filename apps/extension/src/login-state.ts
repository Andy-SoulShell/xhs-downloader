import type { BrowserLoginState } from "@xhs-downloader/contracts";

import { isValidAccountId, readCurrentNavigationAccountId } from "./current-account-navigation";
import { parseInitialStateValue } from "./parser";

const LOGIN_SELECTOR = ".login-container, [class*='login-container']";
const INITIAL_STATE_PREFIX = "window.__INITIAL_STATE__";

/** 从已加载的小红书页面判断登录状态并读取最小账号信息。 */
export function detectLoginState(page: Document, pageUrl: string): BrowserLoginState {
  const user = readCurrentUser(page);
  const stateAccountId = text(user?.userId ?? user?.user_id);
  const stateLoggedIn = user?.guest === false && isValidAccountId(stateAccountId);
  const navigationAccountId = readCurrentNavigationAccountId(page);
  const loginVisible =
    new URL(pageUrl).pathname.includes("login") || Boolean(page.querySelector(LOGIN_SELECTOR));
  const accountId = stateLoggedIn ? stateAccountId : navigationAccountId;
  const loggedIn = Boolean(accountId) && !loginVisible;
  return {
    logged_in: loggedIn,
    user_id: loggedIn ? accountId : null,
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
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
