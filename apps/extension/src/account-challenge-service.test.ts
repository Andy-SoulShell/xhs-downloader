import { afterEach, describe, expect, it, vi } from "vitest";

import {
  answerAccountChallenge,
  claimAccountChallenge,
  supportsAccountChallenges,
  type ExtensionAccountChallengeClaim,
} from "./account-challenge-service";
import { BrowserTaskUnauthorizedError } from "./browser-task-service";

const credential = {
  extensionId: "synthetic-extension",
  token: "synthetic-token",
};
const claim: ExtensionAccountChallengeClaim = {
  challenge_id: "0".repeat(32),
  algorithm: "HMAC-SHA-256",
  challenge_key: "synthetic-key",
  expires_at: "2026-01-01T00:00:45Z",
  lease_token: "synthetic-lease",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("账号挑战本机 API 客户端", () => {
  it("只在协议 5 明确声明能力时启用", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            protocol_version: 5,
            features: { account_challenge: true },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(supportsAccountChallenges("http://127.0.0.1:5556/")).resolves.toBe(true);
  });

  it.each([
    [{ protocol_version: 4, features: { account_challenge: true } }, 200],
    [{ protocol_version: 5, features: { account_challenge: false } }, 200],
    [{ protocol_version: 5, features: { account_challenge: true } }, 503],
  ])("拒绝旧协议、关闭能力或错误响应", async (payload, status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status })),
    );

    await expect(supportsAccountChallenges("http://127.0.0.1:5556")).resolves.toBe(false);
  });

  it("服务不可连接时报告不支持", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("synthetic offline")));

    await expect(supportsAccountChallenges("http://127.0.0.1:5556")).resolves.toBe(false);
  });

  it("使用 Bearer 和扩展标识领取挑战", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(claim), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(claimAccountChallenge("http://127.0.0.1:5556/", credential, 0)).resolves.toEqual(
      claim,
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("wait_seconds=0");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer synthetic-token",
      "X-Extension-Id": "synthetic-extension",
    });
    expect(init.credentials).toBe("omit");
  });

  it("只通过请求局部变量回传证明和一次性租约", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await answerAccountChallenge("http://127.0.0.1:5556", credential, claim, {
      status: "proved",
      proof: "a".repeat(64),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "X-Account-Challenge-Lease": "synthetic-lease",
    });
    expect(init.body).toBe(JSON.stringify({ status: "proved", proof: "a".repeat(64) }));
  });

  it("把 401 映射为共享凭据重新签发信号", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(
      claimAccountChallenge("http://127.0.0.1:5556", credential, 0),
    ).rejects.toBeInstanceOf(BrowserTaskUnauthorizedError);
  });

  it.each([
    [{ message: "固定账号挑战错误" }, "固定账号挑战错误"],
    [{ detail: "固定租约错误" }, "固定租约错误"],
    [null, "HTTP 409"],
  ])("保留安全服务错误 %s", async (payload, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(payload === null ? null : JSON.stringify(payload), {
          status: 409,
        }),
      ),
    );

    await expect(
      answerAccountChallenge("http://127.0.0.1:5556", credential, claim, {
        status: "unverified",
      }),
    ).rejects.toThrow(expected);
  });

  it.each([-1, 31])("拒绝越界领取等待时间 %s", async (waitSeconds) => {
    await expect(
      claimAccountChallenge("http://127.0.0.1:5556", credential, waitSeconds),
    ).rejects.toThrow("0 到 30 秒");
  });
});
