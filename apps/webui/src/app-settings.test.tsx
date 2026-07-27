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
  retryTask,
  submitDetail,
  submitTask,
  updateSettings,
} from "./lib/api";
import { makeDetailResponse, makeDownloadTask, makeSettingsResponse } from "./test/fixtures";

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

describe("管理后台配置集成", () => {
  beforeEach(() => {
    vi.mocked(checkHealth).mockResolvedValue(true);
    vi.mocked(deleteCollectedPost).mockResolvedValue();
    vi.mocked(listClientRecords).mockResolvedValue([]);
    vi.mocked(listCollectedPosts).mockResolvedValue([]);
    vi.mocked(listTasks).mockResolvedValue([]);
    vi.mocked(getSettings).mockResolvedValue(makeSettingsResponse());
    vi.mocked(retryTask).mockResolvedValue(makeDownloadTask({ status: "queued" }));
    vi.mocked(submitDetail).mockResolvedValue(makeDetailResponse());
    vi.mocked(submitTask).mockResolvedValue(makeDownloadTask());
    vi.mocked(updateSettings).mockResolvedValue(makeSettingsResponse({ restart_required: true }));
  });

  it("从管理后台更新服务配置", async () => {
    render(<App />);

    fireEvent.mouseDown(
      await within(await screen.findByRole("tablist", { name: "切换工作台视图" })).findByRole(
        "tab",
        { name: "设置" },
      ),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: /文件与目录/ }));
    fireEvent.change(screen.getByLabelText("媒体目录名"), {
      target: { value: "media" },
    });
    fireEvent.mouseDown(screen.getByRole("tab", { name: /网络与凭据/ }));
    fireEvent.change(screen.getByLabelText("小红书 Cookie"), {
      target: { value: "session=synthetic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          folder_name: "media",
          cookie: "session=synthetic",
        }),
      ),
    );
    expect(await screen.findByText("已保存；部分修改要重启服务才生效")).toBeInTheDocument();
  });
});
