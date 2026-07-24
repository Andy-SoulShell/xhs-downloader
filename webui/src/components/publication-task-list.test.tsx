import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makePublicationTask } from "../test/fixtures";
import { PublicationTaskList } from "./publication-task-list";

describe("发布任务列表", () => {
  it("展示全部状态并提供取消、重试和结果入口", () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const statuses = [
      "scheduled",
      "ready",
      "claimed",
      "filling",
      "publishing",
      "published",
      "needs_review",
      "failed",
      "canceled",
    ] as const;
    render(
      <PublicationTaskList
        onCancel={onCancel}
        onRetry={onRetry}
        tasks={statuses.map((status) =>
          makePublicationTask({
            task_id: status,
            status,
            result_url:
              status === "published"
                ? "https://example.invalid/published"
                : null,
          }),
        )}
      />,
    );

    for (const label of [
      "已排期",
      "等待扩展",
      "已领取",
      "正在填写",
      "正在发布",
      "已发布",
      "待确认",
      "失败",
      "已取消",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getAllByRole("button", { name: "取消" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "重试" })[0]);
    expect(onCancel).toHaveBeenCalledWith("scheduled");
    expect(onRetry).toHaveBeenCalledWith("needs_review");
    expect(screen.getByRole("link", { name: /查看/ })).toHaveAttribute(
      "href",
      "https://example.invalid/published",
    );
    expect(
      screen.getByRole("link", { name: /打开创作页/ }),
    ).toHaveAttribute("href", expect.stringContaining("xhd_task=ready"));
  });

  it("复用紧凑空状态", () => {
    render(
      <PublicationTaskList
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        tasks={[]}
      />,
    );

    expect(screen.getByText("还没有发布任务")).toBeInTheDocument();
  });
});
