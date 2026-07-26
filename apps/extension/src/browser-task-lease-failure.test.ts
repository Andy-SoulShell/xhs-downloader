import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeBrowserTaskClaim } from "./browser-task-claim-execution";
import { makeBrowserTaskClaim, WRITE_PAYLOAD } from "./browser-task-test-helpers";
import type { ExtensionCredential } from "./publication-types";

const credential: ExtensionCredential = {
  extensionId: "synthetic-extension",
  token: "synthetic-token",
};

const withCredential = <T,>(
  operation: (value: ExtensionCredential) => Promise<T>,
): Promise<T> => operation(credential);

/** 记录服务端收到的状态与结果回传。 */
interface ReportedCall {
  url: string;
  body: Record<string, unknown>;
}

let reported: ReportedCall[];

beforeEach(() => {
  reported = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("浏览器任务续租中断", () => {
  it("续租中断后写任务按未确认结果转人工核对", async () => {
    vi.useFakeTimers();
    const claim = makeBrowserTaskClaim("set_like", {
      ...WRITE_PAYLOAD,
      active: true,
    });
    claim.lease_seconds = 0.02;
    let renewals = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : {};
        reported.push({ url, body });
        // 首次运行态请求成功，后续续租一律失败以模拟服务中断。
        if (url.endsWith("/status") && ++renewals > 1) {
          return new Response(JSON.stringify({ message: "服务不可用" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ task_id: "synthetic-task" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const running = executeBrowserTaskClaim(
      "http://service",
      claim,
      async (assertLeaseActive) => {
        await vi.advanceTimersByTimeAsync(60);
        assertLeaseActive();
        return { ok: true, message: "不应到达" };
      },
      withCredential,
    );
    await vi.advanceTimersByTimeAsync(120);
    await running;

    const result = reported.find((call) => call.url.endsWith("/result"));
    expect(result?.body.status).toBe("needs_review");
    expect(result?.body.message).toContain("续租中断");
  });

  it("续租中断后回传结果又遇租约收回时安全退出", async () => {
    vi.useFakeTimers();
    const claim = makeBrowserTaskClaim("set_favorite", {
      ...WRITE_PAYLOAD,
      active: true,
    });
    claim.lease_seconds = 0.02;
    let renewals = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : {};
        reported.push({ url, body });
        // 续租先因服务不可用中断，随后的结果回传才发现租约已被收回。
        if (url.endsWith("/status") && ++renewals > 1) {
          return new Response(JSON.stringify({ message: "服务不可用" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/result")) {
          return new Response(JSON.stringify({ message: "租约无效" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ task_id: "synthetic-task" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const running = executeBrowserTaskClaim(
      "http://service",
      claim,
      async () => {
        await vi.advanceTimersByTimeAsync(60);
        return { ok: true, message: "不应到达" };
      },
      withCredential,
    );
    await vi.advanceTimersByTimeAsync(120);

    await expect(running).resolves.toBeUndefined();
    expect(reported.some((call) => call.url.endsWith("/result"))).toBe(true);
  });

  it("租约已被服务端收回时不再写入任何结果", async () => {
    vi.useFakeTimers();
    const claim = makeBrowserTaskClaim("list_feeds");
    claim.lease_seconds = 0.02;
    let renewals = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const body = init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : {};
        reported.push({ url, body });
        // 409 表示租约已失效，扩展不得再写入结果。
        if (url.endsWith("/status") && ++renewals > 1) {
          return new Response(JSON.stringify({ message: "租约无效" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ task_id: "synthetic-task" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const running = executeBrowserTaskClaim(
      "http://service",
      claim,
      async () => {
        await vi.advanceTimersByTimeAsync(60);
        return { ok: true, message: "读取完成" };
      },
      withCredential,
    );
    await vi.advanceTimersByTimeAsync(120);
    await running;

    expect(reported.some((call) => call.url.endsWith("/result"))).toBe(false);
  });
});
