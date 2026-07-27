import { afterEach, describe, expect, it, vi } from "vitest";

import { makeManagedBrowserStatus } from "../test/managed-browser";
import {
  getManagedBrowserStatus,
  startManagedBrowser,
  stopManagedBrowser,
} from "./managed-browser-api";

describe("受管浏览器 API 客户端", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("通过类型化端点读取、启动和停止", async () => {
    const stopped = makeManagedBrowserStatus();
    const running = makeManagedBrowserStatus({
      state: "running",
      cdp_port: 9222,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(stopped)))
      .mockResolvedValueOnce(new Response(JSON.stringify(running)))
      .mockResolvedValueOnce(new Response(JSON.stringify(stopped)));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(getManagedBrowserStatus(controller.signal)).resolves.toEqual(stopped);
    await expect(startManagedBrowser()).resolves.toEqual(running);
    await expect(stopManagedBrowser()).resolves.toEqual(stopped);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/browser/managed/status", {
      signal: controller.signal,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/browser/managed/start", {
      method: "POST",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/browser/managed/stop", {
      method: "POST",
    });
  });
});
