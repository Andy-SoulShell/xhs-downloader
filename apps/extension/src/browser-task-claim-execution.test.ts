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

function stubFetch(
  onResult?: (body: Record<string, unknown>) => Response | undefined,
): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {};
      reported.push({ url, body });
      if (url.endsWith("/result")) {
        const override = onResult?.(body);
        if (override) return override;
      }
      return new Response(JSON.stringify({ task_id: "synthetic-task" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  reported = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("浏览器任务租约执行", () => {
  it("成功执行后按响应状态回传结果", async () => {
    stubFetch();
    const claim = makeBrowserTaskClaim("list_feeds");

    await executeBrowserTaskClaim(
      "http://service",
      claim,
      async () => ({
        ok: true,
        message: "读取完成",
        result: { items: [], source: "home", keyword: null, has_more: false },
      }),
      withCredential,
    );

    const result = reported.find((call) => call.url.endsWith("/result"));
    expect(result?.body.status).toBe("succeeded");
    expect(result?.body.message).toBe("读取完成");
  });

  it("响应显式给出状态时以该状态为准", async () => {
    stubFetch();
    const claim = makeBrowserTaskClaim("get_feed_detail");

    await executeBrowserTaskClaim(
      "http://service",
      claim,
      async () => ({
        ok: false,
        message: "页面结构不兼容",
        status: "needs_review" as const,
      }),
      withCredential,
    );

    const result = reported.find((call) => call.url.endsWith("/result"));
    expect(result?.body.status).toBe("needs_review");
  });

  it("响应未成功且未给出状态时记为失败", async () => {
    stubFetch();
    const claim = makeBrowserTaskClaim("list_feeds");

    await executeBrowserTaskClaim(
      "http://service",
      claim,
      async () => ({ ok: false, message: "读取失败" }),
      withCredential,
    );

    const result = reported.find((call) => call.url.endsWith("/result"));
    expect(result?.body.status).toBe("failed");
  });

  it("只读任务执行抛错时记为明确失败", async () => {
    stubFetch();
    const claim = makeBrowserTaskClaim("search_feeds");

    await executeBrowserTaskClaim(
      "http://service",
      claim,
      async () => {
        throw new Error("页面导航超时");
      },
      withCredential,
    );

    const result = reported.find((call) => call.url.endsWith("/result"));
    expect(result?.body.status).toBe("failed");
    expect(result?.body.message).toBe("页面导航超时");
  });

  it("写任务执行抛错时转人工核对而不是失败", async () => {
    stubFetch();
    const claim = makeBrowserTaskClaim("post_comment", {
      ...WRITE_PAYLOAD,
      content: "合成评论",
    });

    await executeBrowserTaskClaim(
      "http://service",
      claim,
      async () => {
        throw new Error("点击后页面无响应");
      },
      withCredential,
    );

    const result = reported.find((call) => call.url.endsWith("/result"));
    expect(result?.body.status).toBe("needs_review");
  });

  it("非 Error 异常回退为固定文案", async () => {
    stubFetch();
    const claim = makeBrowserTaskClaim("list_feeds");

    await executeBrowserTaskClaim(
      "http://service",
      claim,
      async () => {
        throw "字符串异常";
      },
      withCredential,
    );

    const result = reported.find((call) => call.url.endsWith("/result"));
    expect(result?.body.message).toBe("浏览器任务执行失败");
  });

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
