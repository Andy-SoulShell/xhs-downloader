import { afterEach, describe, expect, it, vi } from "vitest";

import {
  checkService,
  requestBackgroundDownload,
  requestWorkDetail,
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
        new Response(JSON.stringify({ protocol_version: 0 })),
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
      new Response(JSON.stringify({ task_id: "1234567890abcdef" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestBackgroundDownload(
        "http://127.0.0.1:5556",
        work,
        [1, 3],
        "request-1",
      ),
    ).resolves.toBe("后台任务 12345678 已提交");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      method: "POST",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("http://127.0.0.1:5556/tasks");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      request_id: "request-1",
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
      requestBackgroundDownload("http://service", work, [1], "request-1"),
    ).rejects.toThrow("合成错误");
    await expect(
      requestBackgroundDownload("http://service", work, [1], "request-2"),
    ).rejects.toThrow("没有返回任务标识");
  });

  it("把服务端详情转换为扩展当前帖子", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "作品信息解析完成",
          data: {
            作品ID: "synthetic-work",
            作品标题: "合成测试作品",
            作品描述: "仅用于自动化测试",
            作者: {
              作者ID: "synthetic-author",
              作者昵称: "合成作者",
              头像地址: "https://example.invalid/avatar.jpeg",
            },
            媒体: [
              {
                序号: 1,
                类型: "视频",
                地址: "https://example.invalid/video.mp4",
                扩展名: "mp4",
                预览地址: "https://example.invalid/cover.jpeg",
              },
            ],
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestWorkDetail(
        "http://127.0.0.1:5556/",
        "https://example.invalid/synthetic-work",
      ),
    ).resolves.toMatchObject({
      workId: "synthetic-work",
      authorName: "合成作者",
      media: [
        {
          index: 1,
          kind: "video",
          suffix: "mp4",
        },
      ],
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://127.0.0.1:5556/xhs/detail",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      method: "POST",
    });
  });

  it("拒绝服务端返回其他帖子", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            作品ID: "stale-work",
            作品标题: "旧帖子",
            作品描述: "",
            作者: { 作者ID: "stale-author", 作者昵称: "旧作者" },
            媒体: [],
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestWorkDetail(
        "http://127.0.0.1:5556",
        "https://example.invalid/synthetic-work",
      ),
    ).rejects.toThrow("与当前链接不一致");
  });

  it("转换图片和动态图片并回退到作者 ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            作品ID: "synthetic-work",
            作品标题: "合成图文",
            作品描述: "",
            作者: {
              作者ID: "synthetic-author",
              作者昵称: "",
              头像地址: null,
            },
            媒体: [
              {
                序号: 1,
                类型: "图片",
                地址: "https://example.invalid/image.jpeg",
                扩展名: "jpeg",
              },
              {
                序号: 1,
                类型: "动态图片",
                地址: "https://example.invalid/live.mp4",
                扩展名: "mp4",
              },
            ],
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestWorkDetail(
        "http://127.0.0.1:5556",
        "https://example.invalid/synthetic-work",
      ),
    ).resolves.toMatchObject({
      authorName: "synthetic-author",
      authorAvatar: undefined,
      media: [{ kind: "image" }, { kind: "live" }],
    });
  });

  it("保留详情解析错误并处理空数据", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "详情解析失败" }), {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(new Response("invalid", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: null })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      requestWorkDetail("http://service", work.sourceUrl),
    ).rejects.toThrow("详情解析失败");
    await expect(
      requestWorkDetail("http://service", work.sourceUrl),
    ).rejects.toThrow("HTTP 503");
    await expect(
      requestWorkDetail("http://service", work.sourceUrl),
    ).rejects.toThrow("没有返回帖子数据");
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
