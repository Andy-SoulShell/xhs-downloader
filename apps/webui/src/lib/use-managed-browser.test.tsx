import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeManagedBrowserStatus } from "../test/managed-browser";
import {
  getManagedBrowserStatus,
  startManagedBrowser,
  stopManagedBrowser,
} from "./managed-browser-api";
import { useManagedBrowser } from "./use-managed-browser";

vi.mock("./managed-browser-api", () => ({
  getManagedBrowserStatus: vi.fn(),
  startManagedBrowser: vi.fn(),
  stopManagedBrowser: vi.fn(),
}));

describe("软件自带浏览器生命周期 Hook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getManagedBrowserStatus).mockResolvedValue(makeManagedBrowserStatus());
    vi.mocked(startManagedBrowser).mockResolvedValue(
      makeManagedBrowserStatus({ state: "running", cdp_port: 9222 }),
    );
    vi.mocked(stopManagedBrowser).mockResolvedValue(makeManagedBrowserStatus());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("首次加载并定时同步外部浏览器状态", async () => {
    const { result, unmount } = renderHook(() => useManagedBrowser());
    expect(result.current.loading).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.status?.state).toBe("stopped");
    expect(result.current.loading).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(getManagedBrowserStatus).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("阻止重复启动并采用操作返回的新状态", async () => {
    let finish: (value: ReturnType<typeof makeManagedBrowserStatus>) => void = () => undefined;
    vi.mocked(startManagedBrowser).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useManagedBrowser());
    await act(() => vi.advanceTimersByTimeAsync(0));

    let first: Promise<void>;
    await act(async () => {
      first = result.current.start();
      await result.current.start();
    });
    expect(startManagedBrowser).toHaveBeenCalledOnce();
    expect(result.current.operation).toBe("start");

    await act(async () => {
      finish(makeManagedBrowserStatus({ state: "running", cdp_port: 9222 }));
      await first!;
    });
    expect(result.current.status?.state).toBe("running");
    expect(result.current.operation).toBeNull();
  });

  it("保留旧状态并展示结构化操作错误", async () => {
    vi.mocked(startManagedBrowser).mockRejectedValueOnce(
      new Error("软件自带浏览器用户目录已由另一个服务实例占用"),
    );
    const { result } = renderHook(() => useManagedBrowser());
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(() => result.current.start());

    expect(result.current.status?.state).toBe("stopped");
    expect(result.current.error).toContain("另一个服务实例");
  });
});
