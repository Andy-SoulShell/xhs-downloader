import { describe, expect, it } from "vitest";

import { describeProgress, formatBytes } from "./download-progress";
import type { DownloadProgress } from "./types";

function makeProgress(overrides: Partial<DownloadProgress> = {}): DownloadProgress {
  return {
    completed_files: 0,
    total_files: 0,
    received_bytes: 0,
    total_bytes: 0,
    ...overrides,
  };
}

describe("容量格式化", () => {
  it("按量级选择单位", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(13_000_000)).toBe("12.4 MB");
  });
});

describe("下载进度视图", () => {
  it("尚未开始时不显示进度条", () => {
    const view = describeProgress(makeProgress());

    expect(view.started).toBe(false);
    expect(view.ratio).toBeNull();
    expect(view.label).toBe("正在准备下载");
  });

  it("已知字节总量时给出比例与容量", () => {
    const view = describeProgress(
      makeProgress({
        completed_files: 1,
        total_files: 5,
        received_bytes: 5_000_000,
        total_bytes: 20_000_000,
      }),
    );

    expect(view.ratio).toBeCloseTo(0.25);
    expect(view.label).toContain("2/5");
    expect(view.label).toContain("4.8 MB");
    expect(view.label).toContain("19.1 MB");
  });

  it("上游不给字节总量时退化为文件计数而不是编造百分比", () => {
    // 编造出来的百分比会走到一半卡住甚至倒退，比没有进度更糟。
    const view = describeProgress(
      makeProgress({ completed_files: 2, total_files: 4, received_bytes: 999 }),
    );

    expect(view.ratio).toBeCloseTo(0.5);
    expect(view.label).toBe("正在下载第 3/4 个文件");
    expect(view.label).not.toContain("%");
  });

  it("已接收字节超过登记总量时比例不越界", () => {
    // 断点续传或上游报小了都可能出现，进度条不能溢出。
    const view = describeProgress(
      makeProgress({
        total_files: 1,
        received_bytes: 3_000,
        total_bytes: 2_000,
      }),
    );

    expect(view.ratio).toBe(1);
  });

  it("最后一个文件完成时序号不超出总数", () => {
    const view = describeProgress(
      makeProgress({ completed_files: 3, total_files: 3, total_bytes: 100 }),
    );

    expect(view.label).toContain("3/3");
  });
});
