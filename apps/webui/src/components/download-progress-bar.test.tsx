import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DownloadProgress } from "../lib/types";
import { DownloadProgressBar } from "./download-progress-bar";

function makeProgress(overrides: Partial<DownloadProgress> = {}): DownloadProgress {
  return {
    completed_files: 0,
    total_files: 0,
    received_bytes: 0,
    total_bytes: 0,
    ...overrides,
  };
}

describe("下载进度条", () => {
  it("任务尚未开始时不渲染", () => {
    // 排队阶段挂一条 0% 的进度条会让人以为卡住了。
    const { container } = render(<DownloadProgressBar progress={makeProgress()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("以无障碍进度条语义暴露百分比与说明", () => {
    render(
      <DownloadProgressBar
        progress={makeProgress({
          completed_files: 1,
          total_files: 4,
          received_bytes: 5_000_000,
          total_bytes: 20_000_000,
        })}
      />,
    );

    const bar = screen.getByRole("progressbar", { name: "下载进度" });
    expect(bar).toHaveAttribute("aria-valuenow", "25");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar.getAttribute("aria-valuetext")).toContain("2/4");
  });

  it("上游不给字节总量时按文件计数走进度", () => {
    render(<DownloadProgressBar progress={makeProgress({ completed_files: 1, total_files: 2 })} />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText("正在下载第 2/2 个文件")).toBeInTheDocument();
  });
});
