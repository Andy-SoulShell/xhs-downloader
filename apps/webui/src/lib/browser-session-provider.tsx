import { useMemo, useState, type ReactNode } from "react";

import { BrowserSessionContext } from "./browser-session";
import type { BrowserLoginState } from "./types";
import { useBrowserMonitor } from "./use-browser-monitor";

/**
 * 在应用根部提供共享的浏览器连接状态。
 *
 * @param props.initialAccount 会话初始的登录结果；应用启动时无从得知，
 *   留空即可，主要供需要指定登录态的测试使用。
 */
export function BrowserSessionProvider({
  children,
  initialAccount = null,
}: {
  children: ReactNode;
  initialAccount?: BrowserLoginState | null;
}) {
  const [account, setAccount] = useState<BrowserLoginState | null>(initialAccount);
  const monitor = useBrowserMonitor();
  const value = useMemo(() => ({ account, setAccount, monitor }), [account, monitor]);

  return <BrowserSessionContext value={value}>{children}</BrowserSessionContext>;
}
