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
    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
    expect(screen.getByText("fallback-work")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
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
    expect(screen.getByText("后台下载 · 0 项媒体")).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();

    rerender(<RecordBoard records={[]} />);
    expect(screen.getByText("还没有同步的独立下载记录")).toBeInTheDocument();
    expect(
      screen.getByText("浏览器独立下载完成后，可在扩展中将记录同步到这里。"),
    ).toBeInTheDocument();
  });

  it("展示空任务状态", () => {
    render(<TaskBoard onRetry={vi.fn()} tasks={[]} />);

    expect(screen.getByText("还没有后台下载任务")).toBeInTheDocument();
    expect(
      screen.getByText("从帖子详情提交下载后，任务状态会显示在这里。"),
    ).toBeInTheDocument();
  });
});
