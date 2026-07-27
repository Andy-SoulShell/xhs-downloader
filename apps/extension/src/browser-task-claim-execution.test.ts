import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeBrowserTaskClaim } from "./browser-task-claim-execution";
import { makeBrowserTaskClaim, WRITE_PAYLOAD } from "./browser-task-test-helpers";
import type { ExtensionCredential } from "./publication-types";

const credential: ExtensionCredential = {
  extensionId: "synthetic-extension",
  token: "synthetic-token",
};

const withCredential = <T>(operation: (value: ExtensionCredential) => Promise<T>): Promise<T> =>
  operation(credential);

/** 记录服务端收到的状态与结果回传。 */
interface ReportedCall {
  url: string;
  body: Record<string, unknown>;
}

let reported: ReportedCall[];

function stubFetch(onResult?: (body: Record<string, unknown>) => Response | undefined): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
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
});
