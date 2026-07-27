import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import { BrowserSessionProvider } from "../lib/browser-session-provider";
import type { BrowserLoginState } from "../lib/types";

interface SessionRenderOptions extends Omit<RenderOptions, "wrapper"> {
  /** 渲染时已有的登录结果；默认按“本次会话还没查过”处理。 */
  initialAccount?: BrowserLoginState | null;
}

/**
 * 在共享浏览器会话内渲染组件。
 *
 * 读取登录结果或浏览器监视器的组件都必须包在 BrowserSessionProvider 里，
 * 否则 useBrowserSession 会直接抛错。
 *
 * @param ui 待渲染的组件。
 * @param options 渲染选项，额外支持指定初始登录结果。
 * @returns Testing Library 的渲染结果。
 */
export function renderWithSession(
  ui: ReactElement,
  { initialAccount = null, ...options }: SessionRenderOptions = {},
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <BrowserSessionProvider initialAccount={initialAccount}>{children}</BrowserSessionProvider>
    ),
    ...options,
  });
}
