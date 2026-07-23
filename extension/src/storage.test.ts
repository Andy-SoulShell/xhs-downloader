import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  appendPendingRecord,
  loadPendingRecords,
  loadSettings,
  removePendingRecords,
  saveMode,
} from "./storage";
import type { ClientDownloadRecord } from "./types";

let values: Record<string, unknown>;

beforeEach(() => {
  values = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: values[key] })),
        set: vi.fn(async (next: Record<string, unknown>) => {
          Object.assign(values, next);
        }),
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

function makeRecord(id: string): ClientDownloadRecord {
  return {
    record_id: id,
    work_id: "synthetic-work",
    source_url: "https://example.invalid/synthetic-work",
    title: "合成测试作品",
    mode: "browser",
    status: "completed",
    media_indexes: [1],
    created_at: "2026-01-01T00:00:00.000Z",
    message: "合成下载完成",
  };
}

describe("扩展本地存储", () => {
  it("提供安全默认配置并保留服务地址", async () => {
    await expect(loadSettings()).resolves.toEqual({
      mode: "auto",
      serviceUrl: "http://127.0.0.1:5556",
    });
    values.settings = {
      mode: "browser",
      serviceUrl: "http://localhost:6000",
    };

    await saveMode("background");

    expect(values.settings).toEqual({
      mode: "background",
      serviceUrl: "http://localhost:6000",
    });
  });

  it("幂等更新、限制并删除待同步记录", async () => {
    values.pendingRecords = Array.from({ length: 500 }, (_, index) =>
      makeRecord(`record-${index}`),
    );
    await appendPendingRecord(makeRecord("record-20"));
    let records = await loadPendingRecords();
    expect(records).toHaveLength(500);
    expect(records[0].record_id).toBe("record-20");

    await removePendingRecords(["record-20", "record-21"]);
    records = await loadPendingRecords();
    expect(records.some((item) => item.record_id === "record-20")).toBe(false);
    expect(records.some((item) => item.record_id === "record-21")).toBe(false);
  });

  it("损坏的本地记录恢复为空列表", async () => {
    values.pendingRecords = "invalid";

    await expect(loadPendingRecords()).resolves.toEqual([]);
  });
});
