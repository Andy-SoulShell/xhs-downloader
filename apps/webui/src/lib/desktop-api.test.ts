import { afterEach, describe, expect, it, vi } from "vitest";

import {
  detectDesktopService,
  shutdownDesktopService,
} from "./desktop-api";

describe("桌面服务 API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("只接受带实例身份的一体化服务", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ instance_id: "synthetic-instance" })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(detectDesktopService()).resolves.toBe(true);
    await expect(detectDesktopService()).resolves.toBe(false);
  });

  it("请求服务优雅退出", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "本地服务正在安全退出" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(shutdownDesktopService()).resolves.toBe(
      "本地服务正在安全退出",
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/desktop/shutdown", {
      method: "POST",
    });
  });
});
