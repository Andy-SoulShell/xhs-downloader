import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectDesktopService,
  restartDesktopService,
  shutdownDesktopService,
  waitForServiceReady,
} from "./desktop-api";

describe("桌面服务 API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("只接受带实例身份的一体化服务", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ instance_id: "synthetic-instance" })))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(detectDesktopService()).resolves.toBe(true);
    await expect(detectDesktopService()).resolves.toBe(false);
  });

  it("请求服务优雅退出", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ message: "本地服务正在安全退出" })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(shutdownDesktopService()).resolves.toBe("本地服务正在安全退出");
    expect(fetchMock).toHaveBeenCalledWith("/api/desktop/shutdown", {
      method: "POST",
    });
  });

  it("请求重启并返回服务端确认", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "本地服务正在重启" }))),
    );

    await expect(restartDesktopService()).resolves.toBe("本地服务正在重启");
  });

  it("等待服务恢复直到健康检查通过", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForServiceReady(5_000, 1)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("超过等待时间仍未恢复时返回失败而不是一直等待", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );

    await expect(waitForServiceReady(5, 1)).resolves.toBe(false);
  });
});
