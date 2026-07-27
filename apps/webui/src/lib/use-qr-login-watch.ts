import { useEffect, useRef } from "react";

import { executeBrowserOperation } from "./browser-api";
import type { BrowserLoginState, LoginQrCodeResult } from "./types";

/** 两次登录状态探测之间的间隔。手机上确认到状态可读通常在几秒内。 */
const POLL_INTERVAL_MILLISECONDS = 5_000;

/**
 * 二维码展示期间自动盯登录状态。
 *
 * 扫码是在手机上完成的，界面这边没有任何事件可听；此前用户扫完码还要自己
 * 点一次「检查登录」，否则页面永远停在待扫码。这里在二维码可见期间轮询
 * `/xhs/login/status`，一旦登录立刻回调；二维码过期或被收起就停。
 *
 * 轮询绕开 explorer 的 runRequest：那条通道会置 busy 并取消在途请求，
 * 挂在上面会让后台探测跟用户的每一次操作互相打断。
 *
 * @param qrCode 当前展示的二维码；为空或已登录时不轮询。
 * @param onLoggedIn 确认已登录时的回调，拿到的就是状态接口的返回。
 */
export function useQrLoginWatch(
  qrCode: LoginQrCodeResult | null,
  onLoggedIn: (state: BrowserLoginState) => void,
): void {
  // 回调走 ref：轮询周期不该因为父组件每次渲染换了个函数身份而重启。
  const onLoggedInRef = useRef(onLoggedIn);
  useEffect(() => {
    onLoggedInRef.current = onLoggedIn;
  }, [onLoggedIn]);

  useEffect(() => {
    if (!qrCode || qrCode.is_logged_in || !qrCode.image_data_url) return;
    const expiresAt = qrCode.expires_at ? Date.parse(qrCode.expires_at) : null;
    const controller = new AbortController();
    let active = true;
    let timer: number | null = null;

    const poll = async () => {
      if (!active) return;
      // 过期后静默停止：登录卡本身写着二维码几点失效，重新获取即可。
      if (expiresAt !== null && Date.now() >= expiresAt) return;
      try {
        const { data } = await executeBrowserOperation<BrowserLoginState>(
          "/xhs/login/status",
          {},
          controller.signal,
        );
        if (!active) return;
        if (data.logged_in) {
          onLoggedInRef.current(data);
          return;
        }
      } catch {
        // 单次探测失败（网络抖动、任务失败）不终止整个等待。
      }
      if (active) timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MILLISECONDS);
    };

    timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MILLISECONDS);
    return () => {
      active = false;
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [qrCode]);
}
