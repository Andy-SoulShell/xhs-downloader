import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makeDownloadTask } from "../test/fixtures";
import { RecordBoard, TaskBoard } from "./task-center";

describe("任务与记录管理界面", () => {
  it("展示所有任务状态并允许重试失败项", () => {
    const onRetry = vi.fn();
    render(
      <TaskBoard
        onRetry={onRetry}
        tasks={[
          makeDownloadTask({ task_id: "queued", status: "queued" }),
          makeDownloadTask({ task_id: "running", status: "running" }),
          makeDownloadTask({ task_id: "completed", status: "completed" }),
          makeDownloadTask({
            task_id: "failed",
            status: "failed",
            detail: null,
            media_indexes: [],
            source_url: "https://example.invalid/fallback-work?token=hidden",
          }),
        ]}
      />,
    );

    expect(screen.getByText("排队中")).toBeInTheDocument();
    expect(screen.getByText("下载中")).toBeInTheDocument();
    expect(screen.getByText("已下载")).toBeInTheDocument();
    expect(screen.getByText("下载失败")).toBeInTheDocument();
    expect(screen.getByText("fallback-work")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新下载" }));
    expect(onRetry).toHaveBeenCalledWith("failed");
  });

  it("展示失败的后台独立记录和空状态", () => {
    const { rerender } = render(
      <RecordBoard
        records={[
          {
            record_id: "failed-record",
            work_id: "synthetic-work",
            source_url: "https://example.invalid/work",
            title: "",
            mode: "background",
            status: "failed",
            media_indexes: [],
            created_at: "2026-01-01T00:00:00Z",
            message: "合成记录失败",
          },
        ]}
      />,
    );

    expect(screen.getByText("synthetic-work")).toBeInTheDocument();
    expect(screen.getByText("0 张图片或视频")).toBeInTheDocument();
    expect(screen.getByText("下载失败")).toBeInTheDocument();

    rerender(<RecordBoard records={[]} />);
    expect(screen.getByText("还没有插件下载记录")).toBeInTheDocument();
    expect(screen.getByText(/在插件面板里点一下同步/)).toBeInTheDocument();
  });

  it("展示空任务状态", () => {
    render(<TaskBoard onRetry={vi.fn()} tasks={[]} />);

    expect(screen.getByText("还没有下载记录")).toBeInTheDocument();
    expect(screen.getByText("下载开始后可以在这里看到进度。")).toBeInTheDocument();
  });
});
