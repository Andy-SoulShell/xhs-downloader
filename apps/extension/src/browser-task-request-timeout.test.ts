import { afterEach, describe, expect, it, vi } from "vitest";

import { executeBrowserTaskClaim } from "./browser-task-claim-execution";
import { makeBrowserTaskClaim } from "./browser-task-test-helpers";
import type { ExtensionCredential } from "./publication-types";

const credential: ExtensionCredential = {
  extensionId: "synthetic-extension",
  token: "synthetic-token",
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("浏览器任务状态请求超时", () => {
  it("初次运行态请求永久挂起时按短租约退出且不执行页面动作", async () => {
    vi.useFakeTimers();
    const claim = makeBrowserTaskClaim();
    claim.lease_seconds = 0.03;
    const execute = vi.fn(async () => ({
      ok: true,
      message: "不应执行",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
        neverResolvingResponse(init?.signal),
      ),
    );

    const running = executeBrowserTaskClaim("http://service", claim, execute, withCredential);
    const rejected = expect(running).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(11);
    await rejected;
    expect(execute).not.toHaveBeenCalled();
  });

  it("终态请求永久挂起时有界退出且不会再次执行页面动作", async () => {
    vi.useFakeTimers();
    const claim = makeBrowserTaskClaim();
    claim.lease_seconds = 0.03;
    const execute = vi.fn(async () => ({
      ok: true,
      message: "登录状态已读取",
      result: { logged_in: false, user_id: null, nickname: null },
    }));
    let resultRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (input.toString().endsWith("/result")) {
          resultRequests += 1;
          return neverResolvingResponse(init?.signal);
        }
        return new Response(JSON.stringify({ status: "running" }));
      }),
    );

    const running = executeBrowserTaskClaim("http://service", claim, execute, withCredential);
    const rejected = expect(running).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(11);
    await rejected;
    expect(resultRequests).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

async function withCredential<T>(
  operation: (value: ExtensionCredential) => Promise<T>,
): Promise<T> {
  return operation(credential);
}

function neverResolvingResponse(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_, reject) => {
    const abort = () => reject(new DOMException("请求超时", "AbortError"));
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
  });
}
