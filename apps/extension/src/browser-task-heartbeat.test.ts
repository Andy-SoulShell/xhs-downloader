import { afterEach, describe, expect, it, vi } from "vitest";

import type { BrowserPageTaskResponse } from "./browser-page-runner";
import { executeBrowserTaskClaim } from "./browser-task-claim-execution";
import {
  heartbeatIntervalMilliseconds,
  startBrowserTaskHeartbeat,
} from "./browser-task-heartbeat";
import { BrowserTaskLeaseLostError } from "./browser-task-service";
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

describe("浏览器任务周期续租", () => {
  it("使用服务端短租约周期续租，完成后立即清理且不重复页面动作", async () => {
    vi.useFakeTimers();
    const claim = makeBrowserTaskClaim();
    claim.lease_seconds = 0.09;
    const action = deferred<BrowserPageTaskResponse>();
    const execute = vi.fn(async () => action.promise);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = input.toString();
      return new Response(
        JSON.stringify({
          task_id: claim.task.task_id,
          status: url.endsWith("/result") ? "succeeded" : "running",
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const running = executeBrowserTaskClaim(
      "http://service",
      claim,
      execute,
      withCredential,
    );
    await vi.advanceTimersByTimeAsync(70);
    action.resolve({
      ok: true,
      message: "登录状态已读取",
      result: { logged_in: false, user_id: null, nickname: null },
    });
    await running;

    const statusCalls = callsEndingWith(fetchMock, "/status");
    expect(statusCalls).toHaveLength(3);
    expect(callsEndingWith(fetchMock, "/result")).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(callsEndingWith(fetchMock, "/status")).toHaveLength(3);
  });

  it("页面执行失败后停止心跳并只回传一次安全失败", async () => {
    vi.useFakeTimers();
    const claim = makeBrowserTaskClaim();
    claim.lease_seconds = 0.09;
    const action = deferred<BrowserPageTaskResponse>();
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ status: "running" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const running = executeBrowserTaskClaim(
      "http://service",
      claim,
      async () => action.promise,
      withCredential,
    );
    await vi.advanceTimersByTimeAsync(35);
    action.reject(new Error("合成页面失败"));
    await running;

    const resultCalls = callsEndingWith(fetchMock, "/result");
    expect(resultCalls).toHaveLength(1);
    expect(JSON.parse(resultCalls[0][1]?.body as string)).toMatchObject({
      status: "failed",
    });
    const statusCount = callsEndingWith(fetchMock, "/status").length;
    await vi.advanceTimersByTimeAsync(300);
    expect(callsEndingWith(fetchMock, "/status")).toHaveLength(statusCount);
  });

  it("陈旧租约中止普通结果回传且绝不重新执行页面动作", async () => {
    vi.useFakeTimers();
    const claim = makeBrowserTaskClaim("set_like", {
      feed_id: "synthetic-feed",
      xsec_token: "synthetic-token",
      active: true,
    });
    claim.lease_seconds = 0.09;
    const action = deferred<BrowserPageTaskResponse>();
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (input.toString().endsWith("/status")) {
        statusCalls += 1;
        if (statusCalls > 1) {
          return new Response(JSON.stringify({ detail: "任务租约已经过期" }), {
            status: 409,
          });
        }
      }
      return new Response(JSON.stringify({ status: "running" }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const execute = vi.fn(async (assertLeaseActive: () => void) => {
      assertLeaseActive();
      return action.promise;
    });
    const running = executeBrowserTaskClaim(
      "http://service",
      claim,
      execute,
      withCredential,
    );
    await vi.advanceTimersByTimeAsync(35);
    action.resolve({
      ok: true,
      message: "点赞状态已更新",
      result: { active: true },
    });
    await running;

    expect(statusCalls).toBe(2);
    expect(callsEndingWith(fetchMock, "/result")).toHaveLength(0);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("终态回传遇到租约冲突时不会再次提交替代终态", async () => {
    const claim = makeBrowserTaskClaim();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (input.toString().endsWith("/result")) {
        return new Response(JSON.stringify({ message: "租约已经失效" }), {
          status: 409,
        });
      }
      return new Response(JSON.stringify({ status: "running" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      executeBrowserTaskClaim(
        "http://service",
        claim,
        async () => ({
          ok: true,
          message: "登录状态已读取",
          result: { logged_in: false, user_id: null, nickname: null },
        }),
        withCredential,
      ),
    ).rejects.toBeInstanceOf(BrowserTaskLeaseLostError);
    expect(callsEndingWith(fetchMock, "/result")).toHaveLength(1);
  });

  it("旧服务可由绝对过期时间推导间隔，并可显式停止等待", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const claim = makeBrowserTaskClaim();
    delete claim.lease_seconds;
    claim.task.lease_expires_at = "2026-01-01T00:00:09Z";
    const renew = vi.fn(async () => undefined);

    expect(heartbeatIntervalMilliseconds(claim)).toBe(3_000);
    const heartbeat = startBrowserTaskHeartbeat(claim, renew);
    await vi.advanceTimersByTimeAsync(3_100);
    expect(renew).toHaveBeenCalledTimes(1);
    await heartbeat.stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("停止时会取消正在等待的续租请求且不误报租约失败", async () => {
    vi.useFakeTimers();
    const claim = makeBrowserTaskClaim();
    claim.lease_seconds = 0.03;
    let aborted = false;
    const heartbeat = startBrowserTaskHeartbeat(
      claim,
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new DOMException("已取消", "AbortError"));
            },
            { once: true },
          );
        }),
    );

    await vi.advanceTimersByTimeAsync(11);
    await expect(heartbeat.stop()).resolves.toBeUndefined();
    expect(aborted).toBe(true);
  });
});

async function withCredential<T>(
  operation: (value: ExtensionCredential) => Promise<T>,
): Promise<T> {
  return operation(credential);
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function callsEndingWith(
  fetchMock: ReturnType<typeof vi.fn>,
  suffix: string,
): Array<[string, RequestInit | undefined]> {
  return fetchMock.mock.calls.filter(([input]) =>
    input.toString().endsWith(suffix),
  ) as Array<[string, RequestInit | undefined]>;
}
