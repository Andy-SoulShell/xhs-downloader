import { afterEach, describe, expect, it, vi } from "vitest";

import {
  claimPublicationTask,
  fetchPublicationAssetChunk,
  PublicationUnauthorizedError,
  registerPublicationExtension,
  reportPublicationStatus,
  supportsPublication,
} from "./publication-service";

const credential = {
  extensionId: "synthetic-extension",
  token: "synthetic-token",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("扩展发布服务客户端", () => {
  it("只接受声明发布能力的新版服务", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 2,
            features: { publication: true },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            protocol_version: 1,
            features: { publication: true },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(supportsPublication("http://service/")).resolves.toBe(true);
    await expect(supportsPublication("http://service")).resolves.toBe(false);
    await expect(supportsPublication("http://service")).resolves.toBe(false);
    await expect(supportsPublication("http://service")).resolves.toBe(false);
  });

  it("登记能力令牌并校验缺失响应", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: "issued-token" })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({})));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      registerPublicationExtension("http://service", "extension"),
    ).resolves.toEqual({
      extensionId: "extension",
      token: "issued-token",
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      extension_id: "extension",
    });
    await expect(
      registerPublicationExtension("http://service", "extension"),
    ).rejects.toThrow("没有返回扩展能力令牌");
  });

  it("领取任务并回传执行状态", async () => {
    const claim = { task: { task_id: "task" }, lease_token: "lease" };
    const task = { task_id: "task", status: "filling" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(claim)))
      .mockResolvedValueOnce(new Response(JSON.stringify(task)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      claimPublicationTask("http://service", credential, "task"),
    ).resolves.toEqual(claim);
    await expect(
      reportPublicationStatus(
        "http://service",
        credential,
        "task",
        "lease",
        "filling",
        "正在填充",
      ),
    ).resolves.toEqual(task);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: "Bearer synthetic-token",
      "X-Extension-Id": "synthetic-extension",
    });
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      "X-Publish-Lease": "lease",
    });
  });

  it("拒绝服务端误发的受管浏览器发布任务", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            task: { task_id: "task", target_driver: "managed" },
            lease_token: "lease",
          }),
        ),
      ),
    );

    await expect(
      claimPublicationTask("http://service", credential),
    ).rejects.toThrow("不属于扩展驱动");
  });

  it("读取并验证素材分段", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 206,
        headers: { "Content-Range": "bytes 0-2/3" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const chunk = await fetchPublicationAssetChunk(
      "http://service",
      credential,
      "task",
      "lease",
      "asset",
      0,
    );

    expect(atob(chunk.base64)).toBe("\x01\x02\x03");
    expect(chunk).toMatchObject({
      offset: 0,
      nextOffset: 3,
      total: 3,
      done: true,
    });
    expect(fetchMock.mock.calls[0][1].headers.Range).toBe("bytes=0-262143");
  });

  it("区分未授权、服务错误和损坏分段", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "合成错误" }), { status: 400 }),
      )
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([1]), {
          status: 206,
          headers: { "Content-Range": "invalid" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      claimPublicationTask("http://service", credential),
    ).rejects.toBeInstanceOf(PublicationUnauthorizedError);
    await expect(
      fetchPublicationAssetChunk(
        "http://service",
        credential,
        "task",
        "lease",
        "asset",
        0,
      ),
    ).rejects.toThrow("合成错误");
    await expect(
      fetchPublicationAssetChunk(
        "http://service",
        credential,
        "task",
        "lease",
        "asset",
        0,
      ),
    ).rejects.toThrow("无效的素材分段");
  });
});
