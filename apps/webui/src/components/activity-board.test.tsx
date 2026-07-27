import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { BrowserTask } from "@xhs-downloader/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listBrowserExtensions,
  listBrowserTasks,
  retryBrowserTask,
  reviewBrowserTask,
  revokeBrowserExtension,
} from "../lib/browser-management-api";
import { renderWithSession } from "../test/render-with-session";
import { makeDownloadTask } from "../test/fixtures";
import type { ClientDownloadRecord, DownloadTask } from "../lib/types";
import { ActivityBoard } from "./activity-board";

vi.mock("../lib/browser-management-api", () => ({
  listBrowserExtensions: vi.fn(),
  listBrowserTasks: vi.fn(),
  retryBrowserTask: vi.fn(),
  reviewBrowserTask: vi.fn(),
  revokeBrowserExtension: vi.fn(),
}));

function downloadTask(status: DownloadTask["status"]): DownloadTask {
  return makeDownloadTask({
    task_id: `download-${status}`,
    client_request_id: null,
    source_url: "https://www.xiaohongshu.com/explore/synthetic",
    media_indexes: [],
    status,
    message: "合成下载状态",
    detail: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });
}

function clientRecord(): ClientDownloadRecord {
  return {
    record_id: "synthetic-record",
    work_id: "synthetic-work",
    source_url: "https://www.xiaohongshu.com/explore/synthetic",
    title: "合成插件记录",
    mode: "browser",
    status: "completed",
    media_indexes: [1],
    created_at: "2026-01-01T00:00:00Z",
    message: "浏览器已下载 1 个文件",
  };
}

function browseTask(status: BrowserTask["status"]): BrowserTask {
  return {
    task_id: `browse-${status}`,
    request_id: null,
    kind: "set_like" as const,
    payload: {},
    status,
    result: null,
    target_driver: "extension",
    executor_id: null,
    extension_id: null,
    lease_expires_at: null,
    attempts: 1,
    message: "合成浏览状态",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("动态工作台", () => {
  beforeEach(() => {
    vi.mocked(listBrowserExtensions).mockResolvedValue([]);
    vi.mocked(listBrowserTasks).mockResolvedValue([]);
  });

  it("三类历史各自成组并给出条目数", async () => {
    vi.mocked(listBrowserTasks).mockResolvedValue([browseTask("succeeded")]);

    renderWithSession(
      <ActivityBoard
        onRetryDownload={vi.fn()}
        records={[clientRecord()]}
        tasks={[downloadTask("completed")]}
      />,
    );

    const tabs = await screen.findAllByRole("tab");

    expect(tabs.map((tab) => tab.textContent)).toEqual(["下载1", "浏览操作1", "插件下载1"]);
    // 默认停在下载，其余分类要切换后才呈现，不再串成一页长滚动。
    expect(screen.getByRole("tabpanel")).toHaveTextContent("合成下载状态");
    expect(screen.queryByText("合成插件记录")).not.toBeInTheDocument();
  });

  it("图文帖在下载记录里也用第一张图当封面", async () => {
    // 曾经只读 `预览地址`，那是视频专属字段，图文帖一律退化成状态图标，
    // 同为“已下载”的两条记录长得完全不一样。
    const { container } = renderWithSession(
      <ActivityBoard onRetryDownload={vi.fn()} records={[]} tasks={[makeDownloadTask()]} />,
    );

    await screen.findAllByRole("tab");
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.invalid/image-1",
    );
  });

  it("切换到插件下载与浏览操作分组", async () => {
    vi.mocked(listBrowserTasks).mockResolvedValue([browseTask("succeeded")]);

    renderWithSession(
      <ActivityBoard
        onRetryDownload={vi.fn()}
        records={[clientRecord()]}
        tasks={[downloadTask("completed")]}
      />,
    );

    fireEvent.mouseDown(await screen.findByRole("tab", { name: /插件下载/ }));
    expect(screen.getByText("合成插件记录")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /浏览操作/ }));
    expect(await screen.findByText("点赞")).toBeInTheDocument();
  });

  it("各分组为空时给出各自的空状态", async () => {
    renderWithSession(<ActivityBoard onRetryDownload={vi.fn()} records={[]} tasks={[]} />);

    expect(await screen.findByText("还没有下载记录")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /浏览操作/ }));
    expect(await screen.findByText("还没有浏览操作")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: /插件下载/ }));
    expect(screen.getByText("还没有插件下载记录")).toBeInTheDocument();
  });

  it("结果不确定的浏览操作可由用户确认结论", async () => {
    const reviewed = browseTask("needs_review");
    vi.mocked(listBrowserTasks).mockResolvedValue([reviewed]);
    vi.mocked(reviewBrowserTask).mockResolvedValue({
      ...reviewed,
      status: "failed",
      message: "已由用户确认操作未生效",
    });

    renderWithSession(<ActivityBoard onRetryDownload={vi.fn()} records={[]} tasks={[]} />);

    fireEvent.mouseDown(await screen.findByRole("tab", { name: /浏览操作/ }));
    (await screen.findByRole("button", { name: "没有生效" })).click();
    (await screen.findByRole("button", { name: "确认" })).click();

    await waitFor(() => expect(reviewBrowserTask).toHaveBeenCalledWith(reviewed.task_id, false));
  });

  it("失败的浏览操作提供重试", async () => {
    const failed = browseTask("failed");
    vi.mocked(listBrowserTasks).mockResolvedValue([failed]);
    vi.mocked(retryBrowserTask).mockResolvedValue({
      ...failed,
      status: "queued",
    });

    renderWithSession(<ActivityBoard onRetryDownload={vi.fn()} records={[]} tasks={[]} />);

    fireEvent.mouseDown(await screen.findByRole("tab", { name: /浏览操作/ }));
    (await screen.findByRole("button", { name: "重试" })).click();

    await waitFor(() => expect(retryBrowserTask).toHaveBeenCalledWith(failed.task_id));
    expect(revokeBrowserExtension).not.toHaveBeenCalled();
  });
});
