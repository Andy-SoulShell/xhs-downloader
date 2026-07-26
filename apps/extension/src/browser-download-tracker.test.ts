import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  installDownloadTracking,
  resolveBatchOutcome,
  settleDownloadBatches,
  trackDownloadBatch,
} from "./browser-download-tracker";
import type { BrowserDownloadBatch } from "./types";

function makeBatch(downloadIds = [11, 12]): BrowserDownloadBatch {
  return {
    batch_id: "synthetic-batch",
    work_id: "synthetic-work",
    source_url: "https://www.xiaohongshu.com/explore/synthetic",
    title: "合成标题",
    media_indexes: [1, 2],
    download_ids: downloadIds,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function makeItem(
  state: chrome.downloads.DownloadItem["state"],
  error?: string,
): chrome.downloads.DownloadItem {
  return { state, error } as chrome.downloads.DownloadItem;
}

describe("浏览器下载结果判定", () => {
  it("全部落盘才记为完成", () => {
    const outcome = resolveBatchOutcome(makeBatch(), [
      makeItem("complete"),
      makeItem("complete"),
    ]);

    expect(outcome?.status).toBe("completed");
    expect(outcome?.message).toContain("2 个文件");
  });

  it("仍有文件下载中时不给出结果", () => {
    const outcome = resolveBatchOutcome(makeBatch(), [
      makeItem("complete"),
      makeItem("in_progress"),
    ]);

    expect(outcome).toBeNull();
  });

  it("任一文件中断即整批失败并带上原因", () => {
    const outcome = resolveBatchOutcome(makeBatch(), [
      makeItem("complete"),
      makeItem("interrupted", "SERVER_FORBIDDEN"),
    ]);

    expect(outcome?.status).toBe("failed");
    expect(outcome?.message).toContain("1/2");
    expect(outcome?.message).toContain("SERVER_FORBIDDEN");
  });

  it("查不到的下载项不算成功", () => {
    const outcome = resolveBatchOutcome(makeBatch(), [
      makeItem("complete"),
      undefined,
    ]);

    expect(outcome?.status).toBe("failed");
    expect(outcome?.message).toContain("1/2");
  });

  it("全部中断时统计所有失败文件", () => {
    const outcome = resolveBatchOutcome(makeBatch(), [
      makeItem("interrupted", "FILE_NO_SPACE"),
      makeItem("interrupted", "FILE_NO_SPACE"),
    ]);

    expect(outcome?.status).toBe("failed");
    expect(outcome?.message).toContain("2/2");
  });
});

describe("浏览器下载批次跟踪", () => {
  let stored: Record<string, unknown>;

  beforeEach(() => {
    stored = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => {
            Object.assign(stored, values);
          }),
        },
      },
      downloads: {
        search: vi.fn(async () => []),
        onChanged: { addListener: vi.fn() },
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("批次结束后返回结果并停止重复回报", async () => {
    await trackDownloadBatch(makeBatch());
    vi.mocked(chrome.downloads.search).mockImplementation(async () => [
      makeItem("complete"),
    ]);

    const settled = await settleDownloadBatches();
    const repeated = await settleDownloadBatches();

    expect(settled).toHaveLength(1);
    expect(settled[0].status).toBe("completed");
    expect(repeated).toHaveLength(0);
  });

  it("仍在下载的批次保留到下次对账", async () => {
    await trackDownloadBatch(makeBatch([21]));
    vi.mocked(chrome.downloads.search).mockImplementation(async () => [
      makeItem("in_progress"),
    ]);

    expect(await settleDownloadBatches()).toHaveLength(0);

    vi.mocked(chrome.downloads.search).mockImplementation(async () => [
      makeItem("interrupted", "USER_CANCELED"),
    ]);
    const settled = await settleDownloadBatches();

    expect(settled).toHaveLength(1);
    expect(settled[0].status).toBe("failed");
  });

  it("查询失败按记录缺失处理而不是中断对账", async () => {
    await trackDownloadBatch(makeBatch([31]));
    vi.mocked(chrome.downloads.search).mockRejectedValue(
      new Error("下载记录不可读"),
    );

    const settled = await settleDownloadBatches();

    expect(settled).toHaveLength(1);
    expect(settled[0].status).toBe("failed");
  });

  it("安装时先对账一次并只在状态变化时重新对账", async () => {
    await trackDownloadBatch(makeBatch([41]));
    vi.mocked(chrome.downloads.search).mockImplementation(async () => [
      makeItem("complete"),
    ]);
    const onSettled = vi.fn(async () => undefined);

    installDownloadTracking(onSettled);
    await vi.waitFor(() => expect(onSettled).toHaveBeenCalledOnce());

    const listener = vi.mocked(chrome.downloads.onChanged.addListener).mock
      .calls[0][0];
    listener({ id: 41 } as chrome.downloads.DownloadDelta);
    listener({
      id: 41,
      state: { current: "complete", previous: "in_progress" },
    } as chrome.downloads.DownloadDelta);

    expect(chrome.downloads.onChanged.addListener).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
  });
});
