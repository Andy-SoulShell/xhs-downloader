import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserTask, LoginQrCodeResult } from "./types";
import { executeBrowserOperation } from "./browser-api";
import { useQrLoginWatch } from "./use-qr-login-watch";

vi.mock("./browser-api", () => ({
  executeBrowserOperation: vi.fn(),
}));

const task = { task_id: "synthetic", status: "succeeded" } as BrowserTask;

function makeQrCode(overrides: Partial<LoginQrCodeResult> = {}): LoginQrCodeResult {
  return {
    is_logged_in: false,
    image_data_url: "data:image/png;base64,c3ludGhldGljLXFy",
    // 相对当前时间足够远，避免用例跑到一半就过期。
    expires_at: new Date(Date.now() + 240_000).toISOString(),
    consumed: false,
    ...overrides,
  };
}

beforeEach(() => {
  // restoreAllMocks 不清模块工厂 mock 的调用历史，得显式清。
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  // 项目未开启自动 cleanup；不卸载的话上一个用例的轮询会活到下一个用例里。
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("扫码期间自动盯登录状态", () => {
  it("登录成功后回调并停止轮询", async () => {
    vi.mocked(executeBrowserOperation)
      .mockResolvedValueOnce({
        task,
        data: { logged_in: false, user_id: null, nickname: null },
      })
      .mockResolvedValueOnce({
        task,
        data: { logged_in: true, user_id: "synthetic-user", nickname: "合成昵称" },
      });
    const onLoggedIn = vi.fn();
    renderHook(() => useQrLoginWatch(makeQrCode(), onLoggedIn));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(onLoggedIn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(onLoggedIn).toHaveBeenCalledWith({
      logged_in: true,
      user_id: "synthetic-user",
      nickname: "合成昵称",
    });
    // 已经登录，后面不该再探测。
    await vi.advanceTimersByTimeAsync(20_000);
    expect(executeBrowserOperation).toHaveBeenCalledTimes(2);
  });

  it("单次探测失败不终止等待", async () => {
    vi.mocked(executeBrowserOperation)
      .mockRejectedValueOnce(new Error("网络抖动"))
      .mockResolvedValueOnce({
        task,
        data: { logged_in: true, user_id: "synthetic-user", nickname: null },
      });
    const onLoggedIn = vi.fn();
    renderHook(() => useQrLoginWatch(makeQrCode(), onLoggedIn));

    await vi.advanceTimersByTimeAsync(10_000);

    expect(onLoggedIn).toHaveBeenCalledTimes(1);
  });

  it("没有二维码或已经登录时不轮询", async () => {
    const onLoggedIn = vi.fn();
    const { rerender } = renderHook(({ qr }) => useQrLoginWatch(qr, onLoggedIn), {
      initialProps: { qr: null as LoginQrCodeResult | null },
    });
    rerender({ qr: makeQrCode({ is_logged_in: true, image_data_url: null }) });

    await vi.advanceTimersByTimeAsync(20_000);

    expect(executeBrowserOperation).not.toHaveBeenCalled();
  });

  it("二维码过期后停止探测", async () => {
    const onLoggedIn = vi.fn();
    renderHook(() =>
      useQrLoginWatch(
        // 直接给一个已经过去的时刻，不依赖假时钟是否同时接管了 Date。
        makeQrCode({ expires_at: new Date(Date.now() - 1_000).toISOString() }),
        onLoggedIn,
      ),
    );

    await vi.advanceTimersByTimeAsync(30_000);

    expect(executeBrowserOperation).not.toHaveBeenCalled();
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("二维码被收起时取消在途探测", async () => {
    vi.mocked(executeBrowserOperation).mockImplementation(
      (_path, _payload, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const onLoggedIn = vi.fn();
    const { rerender } = renderHook(({ qr }) => useQrLoginWatch(qr, onLoggedIn), {
      initialProps: { qr: makeQrCode() as LoginQrCodeResult | null },
    });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(executeBrowserOperation).toHaveBeenCalledTimes(1);
    rerender({ qr: null });
    await vi.advanceTimersByTimeAsync(20_000);

    expect(executeBrowserOperation).toHaveBeenCalledTimes(1);
    expect(onLoggedIn).not.toHaveBeenCalled();
  });
});
