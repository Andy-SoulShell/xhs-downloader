import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runBrowserTaskPoll } from "./browser-task-runner";
import { BROWSER_TASK_REGISTER_TIMEOUT_MS, registerBrowserExtension } from "./browser-task-service";

let values: Record<string, unknown>;

beforeEach(() => {
  values = {
    settings: { serviceUrl: "http://service", mode: "auto" },
  };
  vi.stubGlobal("chrome", {
    runtime: { id: "synthetic-extension" },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]]),
          ),
        ),
        set: vi.fn(async (next: Record<string, unknown>) => {
          Object.assign(values, next);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) {
            delete values[key];
          }
        }),
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("浏览器任务扩展登记超时", () => {
  it("服务端无响应时会在五秒后真正中止登记请求", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException("合成登记超时", "TimeoutError")),
        milliseconds,
      );
      return controller.signal;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (!(signal instanceof AbortSignal)) {
              reject(new Error("登记请求缺少中止信号"));
              return;
            }
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      ),
    );

    const registration = registerBrowserExtension("http://service", "synthetic-extension");
    const rejection = expect(registration).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(BROWSER_TASK_REGISTER_TIMEOUT_MS);
    await rejection;
  });

  it("首次登记和 401 后重新登记都携带有界超时信号", async () => {
    const signalTimeouts = new Map<AbortSignal, number>();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const signal = new AbortController().signal;
      signalTimeouts.set(signal, milliseconds);
      return signal;
    });
    const capabilities = () =>
      new Response(
        JSON.stringify({
          protocol_version: 4,
          features: { browser_tasks: true },
        }),
      );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(capabilities())
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "initial-token" })))
      .mockResolvedValueOnce(new Response("null"))
      .mockResolvedValueOnce(capabilities())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: "renewed-token" })))
      .mockResolvedValueOnce(new Response("null"));
    vi.stubGlobal("fetch", fetchMock);

    await runBrowserTaskPoll();
    await runBrowserTaskPoll();

    const registrationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/browser/extension/register"),
    );
    expect(registrationCalls).toHaveLength(2);
    for (const [, init] of registrationCalls) {
      const signal = (init as RequestInit).signal;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signalTimeouts.get(signal as AbortSignal)).toBe(BROWSER_TASK_REGISTER_TIMEOUT_MS);
    }
    // 凭据必须带安装标识: 同一个未打包目录在两个浏览器里扩展 ID 相同,
    // 只按扩展 ID 存会让两边互相顶掉令牌并陷入登记循环
    expect(values.extensionCredential).toEqual({
      extensionId: "synthetic-extension",
      token: "renewed-token",
      installationId: expect.any(String),
    });
    // 重新登记不该换掉安装标识, 否则服务端会当成又一个新实例
    expect(values.installationId).toBe(
      (values.extensionCredential as { installationId: string }).installationId,
    );
  });
});
