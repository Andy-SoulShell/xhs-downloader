import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runAccountChallengePoll } from "./account-challenge-runner";

const claim = {
  challenge_id: "0".repeat(32),
  algorithm: "HMAC-SHA-256",
  challenge_key: "synthetic-key",
  expires_at: "2026-01-01T00:00:45Z",
  lease_token: "synthetic-lease",
};
let tabs: Array<{ id?: number; active?: boolean }>;
let pageResponse: unknown;
let storageSet: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const values: Record<string, unknown> = {
    settings: { serviceUrl: "http://service", mode: "auto" },
    extensionCredential: {
      extensionId: "synthetic-extension",
      token: "synthetic-token",
      // 没有安装标识的旧凭据会被强制重新登记一次, 那是升级路径不是常态
      installationId: "synthetic-installation",
    },
  };
  tabs = [{ id: 7, active: true }];
  pageResponse = { status: "proved", proof: "a".repeat(64) };
  storageSet = vi.fn(async () => undefined);
  vi.stubGlobal("chrome", {
    runtime: { id: "synthetic-extension" },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]]),
          ),
        ),
        set: storageSet,
        remove: vi.fn(async () => undefined),
      },
    },
    tabs: {
      query: vi.fn(async () => tabs),
      create: vi.fn(async () => ({ id: 8, active: false })),
      remove: vi.fn(async () => undefined),
      sendMessage: vi.fn(async () => pageResponse),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("账号挑战后台执行器", () => {
  it("没有待处理挑战时不访问页面", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              protocol_version: 5,
              features: { account_challenge: true },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response("null")),
    );

    await runAccountChallengePoll();

    expect(chrome.tabs.query).not.toHaveBeenCalled();
  });

  it("在现有页面计算并回传证明且不写浏览器存储", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 5,
            features: { account_challenge: true },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(claim)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await runAccountChallengePoll();

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
      type: "browser-account-challenge",
      challenge: {
        challengeId: claim.challenge_id,
        challengeKey: claim.challenge_key,
      },
    });
    expect(fetchMock.mock.calls[1][0]).toContain("wait_seconds=25");
    expect(fetchMock.mock.calls[2][1].headers).toMatchObject({
      "X-Account-Challenge-Lease": "synthetic-lease",
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual(pageResponse);
    expect(storageSet).not.toHaveBeenCalled();
  });

  it("没有现成页面时只创建并清理一个后台探索页", async () => {
    tabs = [];
    pageResponse = { status: "logged_out" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              protocol_version: 5,
              features: { account_challenge: true },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify(claim)))
        .mockResolvedValueOnce(new Response(null, { status: 204 })),
    );

    await runAccountChallengePoll();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://www.xiaohongshu.com/explore/",
      active: false,
    });
    expect(chrome.tabs.remove).toHaveBeenCalledWith(8);
  });

  it("页面返回未知结构时只回传 unverified", async () => {
    pageResponse = {
      status: "proved",
      proof: "invalid",
      user_id: "must-not-forward",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 5,
            features: { account_challenge: true },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(claim)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await runAccountChallengePoll();

    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({
      status: "unverified",
    });
  });
});
