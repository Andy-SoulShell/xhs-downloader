import { createContext, useContext } from "react";

import type { BrowserLoginState } from "./types";
import type { BrowserMonitorState } from "./use-browser-monitor";

/**
 * 全应用共享的浏览器连接状态。
 *
 * 登录结果在「浏览小红书」里取得，却要显示在设置页的连接状态卡上；
 * 扩展心跳与浏览操作历史同时被设置页和动态页使用。各自持有一份会让
 * 两处显示不一致，监视器还会因此按两倍频率轮询本地服务。
 */
interface BrowserSession {
  /** 最近一次登录检查或扫码的结果；null 表示本次会话还没查过。 */
  account: BrowserLoginState | null;
  setAccount: (account: BrowserLoginState | null) => void;
  monitor: BrowserMonitorState;
}

export const BrowserSessionContext = createContext<BrowserSession | null>(null);

/**
 * 读取共享的浏览器连接状态。
 *
 * @returns 当前登录结果与浏览器监视器。
 * @throws 不在 BrowserSessionProvider 内调用时抛出；静默退化成各自的
 *   本地状态正是这里要消除的问题。
 */
export function useBrowserSession(): BrowserSession {
  const value = useContext(BrowserSessionContext);
  if (!value) throw new Error("useBrowserSession 必须在 BrowserSessionProvider 内使用");
  return value;
}
