import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkService,
  requestBackgroundDownload,
  syncClientRecords,
} from "./service";
import type {
  ClientDownloadRecord,
  ExtensionWork,
} from "./types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const work: ExtensionWork = {
  workId: "synthetic-work",
  sourceUrl: "https://example.invalid/synthetic-work",
  title: "合成测试作品",
  description: "",
  authorName: "合成作者",
  media: [],
};

const record: ClientDownloadRecord = {
  record_id: "synthetic-record",
  work_id: work.workId,
  source_url: work.sourceUrl,
  title: work.title,
  mode: "browser",
  status: "completed",
  media_indexes: [1],
  created_at: "2026-01-01T00:00:00.000Z",
  message: "合成下载完成",
};

describe("本地服务客户端", () => {
  it("根据协议版本判断服务是否可用", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ protocol_version: 1 })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ protocol_version: 2 })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkService("http://127.0.0.1:5556/")).resolves.toBe(true);
    await expect(checkService("http://127.0.0.1:5556")).resolves.toBe(false);
    await expect(checkService("http://127.0.0.1:5556")).resolves.toBe(false);
    await expect(checkService("http://127.0.0.1:5556")).resolves.toBe(false);
    expect(fetchMock.mock.calls[0][0]).not.toContain("//extension");
  });

  it("提交后台下载且不携带浏览器凭据", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "后台下载完成" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestBackgroundDownload("http://127.0.0.1:5556", work, [1, 3]),
    ).resolves.toBe("后台下载完成");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      method: "POST",
    });
  });

  it("保留服务端错误并处理空响应", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "合成错误" }), { status: 400 }),
      )
      .mockResolvedValueOnce(new Response(null));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestBackgroundDownload("http://service", work, [1]),
    ).rejects.toThrow("合成错误");
    await expect(
      requestBackgroundDownload("http://service", work, [1]),
    ).resolves.toBe("后台下载完成");
  });

  it("同步记录并跳过空批次", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: 200 })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: 1 })),
      )
      .mockResolvedValueOnce(new Response("invalid", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(syncClientRecords("http://service", [])).resolves.toBe(0);
    await expect(
      syncClientRecords(
        "http://service",
        Array.from({ length: 201 }, (_, index) => ({
          ...record,
          record_id: `record-${index}`,
        })),
      ),
    ).resolves.toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(
      syncClientRecords("http://service", [record]),
    ).rejects.toThrow("HTTP 500");
  });
});
