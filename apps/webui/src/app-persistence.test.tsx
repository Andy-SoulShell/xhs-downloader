import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./app";
import {
  checkHealth,
  deleteCollectedPost,
  getSettings,
  listClientRecords,
  listCollectedPosts,
  listTasks,
} from "./lib/api";
import { makeDetailResponse, makeSettingsResponse } from "./test/fixtures";

vi.mock("./lib/api", () => ({
  checkHealth: vi.fn(),
  deleteCollectedPost: vi.fn(),
  getSettings: vi.fn(),
  listClientRecords: vi.fn(),
  listCollectedPosts: vi.fn(),
  listTasks: vi.fn(),
  retryTask: vi.fn(),
  submitDetail: vi.fn(),
  submitTask: vi.fn(),
  updateSettings: vi.fn(),
}));

describe("采集帖子持久化", () => {
  beforeEach(() => {
    vi.mocked(checkHealth).mockResolvedValue(true);
    vi.mocked(deleteCollectedPost).mockResolvedValue();
    vi.mocked(getSettings).mockResolvedValue(makeSettingsResponse());
    vi.mocked(listClientRecords).mockResolvedValue([]);
    vi.mocked(listCollectedPosts).mockResolvedValue([
      makeDetailResponse().data!,
    ]);
    vi.mocked(listTasks).mockResolvedValue([]);
  });

  it("启动时恢复未下载帖子并同步删除", async () => {
    render(<App />);

    const restored = await screen.findByRole("button", {
      name: "打开帖子：合成测试帖子",
    });
    expect(screen.getByText("1 个帖子 · 0 个已下载")).toBeInTheDocument();

    fireEvent.click(restored);
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "移除帖子：合成测试帖子",
      }),
    );

    await waitFor(() =>
      expect(deleteCollectedPost).toHaveBeenCalledWith("synthetic-work"),
    );
    expect(screen.getByText("帖子列表还是空的")).toBeInTheDocument();
  });

  it("帖子库读取失败时显示错误", async () => {
    vi.mocked(listCollectedPosts).mockRejectedValue(
      new Error("帖子库暂时不可用"),
    );
    render(<App />);

    expect(await screen.findByText("帖子库暂时不可用")).toBeInTheDocument();
  });

  it.each([
    [new Error("帖子删除被拒绝"), "帖子删除被拒绝"],
    ["未知异常", "帖子移除失败"],
  ])("帖子删除失败时保留列表并显示反馈", async (reason, message) => {
    vi.mocked(deleteCollectedPost).mockRejectedValue(reason);
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "打开帖子：合成测试帖子",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "移除帖子：合成测试帖子",
      }),
    );

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText("1 个帖子 · 0 个已下载")).toBeInTheDocument();
  });
});
