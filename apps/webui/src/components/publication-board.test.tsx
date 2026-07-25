import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPublicationDraft,
  listPublicationDrafts,
  listPublicationTasks,
  resumePublicationVerification,
  retryPublicationTask,
} from "../lib/publication-api";
import {
  makePublicationDraft,
  makePublicationTask,
} from "../test/fixtures";
import { PublicationBoard } from "./publication-board";

vi.mock("../lib/publication-api", () => ({
  cancelPublicationTask: vi.fn(),
  createPublicationDraft: vi.fn(),
  deletePublicationDraft: vi.fn(),
  listPublicationDrafts: vi.fn(),
  listPublicationTasks: vi.fn(),
  removePublicationAsset: vi.fn(),
  resumePublicationVerification: vi.fn(),
  reviewPublicationTask: vi.fn(),
  retryPublicationTask: vi.fn(),
  submitPublicationTask: vi.fn(),
  updatePublicationDraft: vi.fn(),
  uploadPublicationAsset: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listPublicationDrafts).mockResolvedValue([]);
  vi.mocked(listPublicationTasks).mockResolvedValue([]);
});

describe("发布中心界面", () => {
  it("从复用空状态创建第一份草稿", async () => {
    const draft = makePublicationDraft();
    vi.mocked(createPublicationDraft).mockResolvedValue(draft);
    const onNotify = vi.fn();
    render(<PublicationBoard onNotify={onNotify} />);

    expect(screen.getByText("正在加载发布中心")).toBeInTheDocument();
    const button = await screen.findByRole("button", {
      name: "新建第一份草稿",
    });
    fireEvent.click(button);

    expect(await screen.findByLabelText("标题")).toHaveValue(draft.title);
    expect(onNotify).toHaveBeenCalledWith("已新建发布草稿");
  });

  it("切换草稿并处理失败任务", async () => {
    const first = makePublicationDraft();
    const second = makePublicationDraft({
      draft_id: "second",
      title: "第二份草稿",
    });
    const task = makePublicationTask({
      status: "failed",
      message: "合成发布失败",
    });
    vi.mocked(listPublicationDrafts).mockResolvedValue([first, second]);
    vi.mocked(listPublicationTasks).mockResolvedValue([task]);
    vi.mocked(retryPublicationTask).mockResolvedValue({
      ...task,
      status: "ready",
    });
    const onNotify = vi.fn();
    render(<PublicationBoard onNotify={onNotify} />);

    const selector = await screen.findByLabelText("当前草稿");
    fireEvent.change(selector, { target: { value: "second" } });
    expect(screen.getByLabelText("标题")).toHaveValue("第二份草稿");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() =>
      expect(retryPublicationTask).toHaveBeenCalledWith(task.task_id),
    );
    expect(onNotify).toHaveBeenCalledWith("发布任务已重新就绪");
  });

  it("展示发布中心读取错误", async () => {
    vi.mocked(listPublicationDrafts).mockRejectedValue(
      new Error("本地发布服务不可用"),
    );
    render(<PublicationBoard onNotify={vi.fn()} />);

    expect(
      await screen.findByText("本地发布服务不可用"),
    ).toBeInTheDocument();
    expect(screen.getByText("还没有发布草稿")).toBeInTheDocument();
  });

  it("二次确认后恢复等待验证的原任务", async () => {
    const draft = makePublicationDraft();
    const task = makePublicationTask({
      status: "awaiting_verification",
      message: "请在受管浏览器完成验证",
    });
    vi.mocked(listPublicationDrafts).mockResolvedValue([draft]);
    vi.mocked(listPublicationTasks).mockResolvedValue([task]);
    vi.mocked(resumePublicationVerification).mockResolvedValue({
      task_id: task.task_id,
      resumed: true,
      publish_attempted: false,
      message: "已确认安全验证完成，受管发布将在原页面继续",
    });
    const onNotify = vi.fn();
    render(<PublicationBoard onNotify={onNotify} />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "我已完成验证，继续原任务",
      }),
    );
    expect(resumePublicationVerification).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "确认验证完成并继续" }),
    );

    await waitFor(() =>
      expect(resumePublicationVerification).toHaveBeenCalledWith(task.task_id),
    );
    expect(onNotify).toHaveBeenCalledWith(
      "已确认验证完成，原发布任务正在继续",
    );
  });
});
