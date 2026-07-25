import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type {
  BrowserExtensionStatus,
  BrowserTask,
} from "@xhs-downloader/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listBrowserExtensions,
  listBrowserTasks,
  retryBrowserTask,
} from "../lib/browser-management-api";
import { makeManagedBrowserControl } from "../test/managed-browser";
import { BrowserMonitor } from "./browser-monitor";

vi.mock("../lib/browser-management-api", () => ({
  listBrowserExtensions: vi.fn(),
  listBrowserTasks: vi.fn(),
  retryBrowserTask: vi.fn(),
}));

const extension: BrowserExtensionStatus = {
  extension_id: "synthetic-extension",
  registered_at: "2026-01-01T00:00:00Z",
  last_seen_at: new Date().toISOString(),
  online: true,
};

function browserTask(
  status: BrowserTask["status"],
  kind: BrowserTask["kind"],
): BrowserTask {
  return {
    task_id: `${kind}-${status}`,
    request_id: `request-${kind}-${status}`,
    kind,
    payload: { content: "不应展示的合成正文" },
    status,
    result: null,
    target_driver: "extension",
    executor_id: "synthetic-extension",
    extension_id: "synthetic-extension",
    lease_expires_at: null,
    attempts: 1,
    message: status === "needs_review" ? "结果尚未确认" : "合成任务状态",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("浏览器状态与操作记录", () => {
  beforeEach(() => {
    vi.mocked(listBrowserExtensions).mockResolvedValue([extension]);
    vi.mocked(listBrowserTasks).mockResolvedValue([
      browserTask("succeeded", "list_feeds"),
      browserTask("failed", "get_feed_detail"),
      browserTask("needs_review", "post_comment"),
      browserTask("queued", "search_feeds"),
    ]);
  });

  it("展示在线心跳、登录账号和脱敏任务历史", async () => {
    render(
      <BrowserMonitor
        account={{
          logged_in: true,
          nickname: "合成账号",
          user_id: "synthetic-user",
        }}
        browserDriver="managed"
        managedBrowser={makeManagedBrowserControl()}
      />,
    );

    expect(await screen.findByText("1/1 个实例在线")).toBeInTheDocument();
    expect(screen.getByText("合成账号")).toBeInTheDocument();
    expect(screen.getByText("读取推荐")).toBeInTheDocument();
    expect(screen.getByText("需要确认")).toBeInTheDocument();
    expect(
      screen.getByText("结果可能已写入小红书，请人工核对，禁止直接重试。"),
    ).toBeInTheDocument();
    expect(screen.queryByText("不应展示的合成正文")).not.toBeInTheDocument();
  });

  it("只允许明确失败的任务重试并更新本地状态", async () => {
    const failed = browserTask("failed", "get_feed_detail");
    vi.mocked(retryBrowserTask).mockResolvedValue({
      ...failed,
      status: "queued",
      message: "等待浏览器扩展重试",
    });
    render(
      <BrowserMonitor
        account={null}
        browserDriver="extension"
        managedBrowser={makeManagedBrowserControl()}
      />,
    );

    const retry = await screen.findByRole("button", { name: "重试" });
    expect(screen.getAllByRole("button", { name: "重试" })).toHaveLength(1);
    fireEvent.click(retry);

    await waitFor(() =>
      expect(retryBrowserTask).toHaveBeenCalledWith(failed.task_id),
    );
    expect(
      await screen.findByText("等待浏览器扩展重试"),
    ).toBeInTheDocument();
  });

  it("刷新心跳并展示秒级和分钟级相对时间", async () => {
    vi.mocked(listBrowserExtensions).mockResolvedValue([
      {
        ...extension,
        last_seen_at: new Date(Date.now() - 30_000).toISOString(),
      },
    ]);
    render(
      <BrowserMonitor
        account={null}
        browserDriver={null}
        managedBrowser={makeManagedBrowserControl()}
      />,
    );

    expect(await screen.findByText("30 秒前")).toBeInTheDocument();
    vi.mocked(listBrowserExtensions).mockResolvedValue([
      {
        ...extension,
        last_seen_at: new Date(Date.now() - 120_000).toISOString(),
        online: false,
      },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "刷新" }));

    expect(await screen.findByText("2 分钟前")).toBeInTheDocument();
  });

  it("重试失败时保留任务并显示明确错误", async () => {
    vi.mocked(retryBrowserTask).mockRejectedValue(
      new Error("浏览器任务当前不可重试"),
    );
    render(
      <BrowserMonitor
        account={null}
        browserDriver="managed"
        managedBrowser={makeManagedBrowserControl()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "重试" }));

    expect(
      await screen.findByText("浏览器任务当前不可重试"),
    ).toBeInTheDocument();
    expect(screen.getByText("失败")).toBeInTheDocument();
  });

  it("展示离线空态与管理接口错误", async () => {
    vi.mocked(listBrowserExtensions).mockResolvedValue([]);
    vi.mocked(listBrowserTasks).mockRejectedValueOnce(
      new Error("浏览器管理接口不可用"),
    );
    render(
      <BrowserMonitor
        account={null}
        browserDriver="managed"
        managedBrowser={makeManagedBrowserControl()}
      />,
    );

    expect(
      await screen.findByText("浏览器管理接口不可用"),
    ).toBeInTheDocument();
    expect(screen.getByText("离线")).toBeInTheDocument();
    expect(screen.getByText("还没有浏览器操作记录")).toBeInTheDocument();
  });
});
