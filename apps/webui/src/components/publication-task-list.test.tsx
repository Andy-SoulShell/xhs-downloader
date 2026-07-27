import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makePublicationTask } from "../test/fixtures";
import { PublicationTaskList } from "./publication-task-list";

describe("发布任务列表", () => {
  it("展示全部状态并提供取消、重试和结果入口", () => {
    const onCancel = vi.fn().mockResolvedValue(undefined);
    const onResumeVerification = vi.fn().mockResolvedValue(undefined);
    const onReview = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const statuses = [
      "scheduled",
      "ready",
      "claimed",
      "filling",
      "publishing",
      "awaiting_verification",
      "published",
      "needs_review",
      "failed",
      "canceled",
    ] as const;
    render(
      <PublicationTaskList
        onCancel={onCancel}
        onResumeVerification={onResumeVerification}
        onReview={onReview}
        onRetry={onRetry}
        tasks={statuses.map((status) =>
          makePublicationTask({
            task_id: status,
            status,
            result_url: status === "published" ? "https://example.invalid/published" : null,
          }),
        )}
      />,
    );

    for (const label of [
      "等待到点",
      "正在填写内容",
      "正在发布",
      "等待你完成验证",
      "已发布",
      "需要你确认结果",
      "发布失败",
      "已取消",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // 等待领取与已领取对用户是同一件事，合并为一句"准备发布"。
    expect(screen.getAllByText("准备发布")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "取消" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    fireEvent.click(screen.getByRole("button", { name: "没发出去" }));
    expect(onReview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    fireEvent.click(screen.getByRole("button", { name: "发出去了" }));
    fireEvent.click(screen.getByRole("button", { name: "再看看" }));
    fireEvent.click(screen.getByRole("button", { name: "发出去了" }));
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(onCancel).toHaveBeenCalledWith("scheduled");
    expect(onRetry).toHaveBeenCalledWith("failed");
    expect(onReview).toHaveBeenCalledWith("needs_review", false);
    expect(onReview).toHaveBeenCalledWith("needs_review", true);
    expect(screen.getByRole("link", { name: /查看/ })).toHaveAttribute(
      "href",
      "https://example.invalid/published",
    );
    expect(screen.getByRole("link", { name: /打开创作页/ })).toHaveAttribute(
      "href",
      expect.stringContaining("xhd_task=ready"),
    );
  });

  it("复用紧凑空状态", () => {
    render(
      <PublicationTaskList
        onCancel={vi.fn()}
        onResumeVerification={vi.fn()}
        onReview={vi.fn()}
        onRetry={vi.fn()}
        tasks={[]}
      />,
    );

    expect(screen.getByText("还没有发布任务")).toBeInTheDocument();
  });

  it("受管任务不提供日常浏览器创作页并显示冻结执行器", () => {
    render(
      <PublicationTaskList
        onCancel={vi.fn()}
        onResumeVerification={vi.fn()}
        onReview={vi.fn()}
        onRetry={vi.fn()}
        tasks={[
          makePublicationTask({
            target_driver: "managed",
            publish_attempted: true,
          }),
        ]}
      />,
    );

    expect(screen.getByText("准备发布")).toBeInTheDocument();
    expect(screen.getByText("软件自带浏览器")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /打开创作页/ })).not.toBeInTheDocument();
  });

  it("为被拦截或重试后的扩展官方定时任务保留创作页入口", () => {
    const videoDraft = makePublicationTask().package;
    videoDraft.assets[0] = {
      ...videoDraft.assets[0],
      media_type: "video/mp4",
    };
    render(
      <PublicationTaskList
        onCancel={vi.fn()}
        onResumeVerification={vi.fn()}
        onReview={vi.fn()}
        onRetry={vi.fn()}
        tasks={[
          makePublicationTask({
            mode: "platform_scheduled",
            package: videoDraft,
          }),
        ]}
      />,
    );

    const link = screen.getByRole("link", { name: /打开创作页/ });
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("xhd_task=synthetic-publication-task"),
    );
    expect(link).toHaveAttribute("href", expect.stringContaining("target=video"));
  });
});
