import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BrowserExtensionStatus } from "@xhs-downloader/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listBrowserExtensions,
  listBrowserTasks,
  revokeBrowserExtension,
} from "../lib/browser-management-api";
import { BrowserSessionProvider } from "../lib/browser-session-provider";
import { makeManagedBrowserControl } from "../test/managed-browser";
import { ConnectionPanel } from "./connection-panel";

vi.mock("../lib/browser-management-api", () => ({
  listBrowserExtensions: vi.fn(),
  listBrowserTasks: vi.fn(),
  retryBrowserTask: vi.fn(),
  reviewBrowserTask: vi.fn(),
  revokeBrowserExtension: vi.fn(),
}));

const extension: BrowserExtensionStatus = {
  extension_id: "synthetic-extension",
  registered_at: "2026-01-01T00:00:00Z",
  last_seen_at: new Date().toISOString(),
  online: true,
};

describe("连接状态面板", () => {
  beforeEach(() => {
    vi.mocked(listBrowserExtensions).mockResolvedValue([extension]);
    vi.mocked(listBrowserTasks).mockResolvedValue([]);
  });

  it("用日常说法描述连接方式与登录账号", async () => {
    render(
      <BrowserSessionProvider
        initialAccount={{
          logged_in: true,
          nickname: "合成账号",
          user_id: "synthetic-user",
        }}
      >
        <ConnectionPanel browserDriver="extension" managedBrowser={makeManagedBrowserControl()} />
      </BrowserSessionProvider>,
    );

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    expect(screen.getByText("我自己的浏览器")).toBeInTheDocument();
    expect(screen.getByText("合成账号")).toBeInTheDocument();
    // 不再展示扩展标识哈希与心跳等内部信息。
    expect(screen.queryByText(/synthetic-extension/)).not.toBeInTheDocument();
  });

  it("未选择连接方式时明确提示", async () => {
    vi.mocked(listBrowserExtensions).mockResolvedValue([]);

    render(
      <BrowserSessionProvider>
        <ConnectionPanel browserDriver={null} managedBrowser={makeManagedBrowserControl()} />
      </BrowserSessionProvider>,
    );

    expect(await screen.findByText("未连接")).toBeInTheDocument();
    expect(screen.getByText("还没有选择连接方式")).toBeInTheDocument();
    expect(screen.getByText("待检查")).toBeInTheDocument();
  });

  it("断开插件需要二次确认", async () => {
    vi.mocked(revokeBrowserExtension).mockResolvedValue(undefined);

    render(
      <BrowserSessionProvider>
        <ConnectionPanel browserDriver="extension" managedBrowser={makeManagedBrowserControl()} />
      </BrowserSessionProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "断开" }));
    expect(revokeBrowserExtension).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "断开" }));
    fireEvent.click(screen.getByRole("button", { name: "确认断开" }));

    await waitFor(() =>
      expect(revokeBrowserExtension).toHaveBeenCalledWith(extension.extension_id),
    );
  });

  it("读取失败时展示错误而不是空白", async () => {
    vi.mocked(listBrowserExtensions).mockResolvedValue([]);
    vi.mocked(listBrowserTasks).mockRejectedValueOnce(new Error("连接状态读取失败"));

    render(
      <BrowserSessionProvider>
        <ConnectionPanel browserDriver="managed" managedBrowser={makeManagedBrowserControl()} />
      </BrowserSessionProvider>,
    );

    expect(await screen.findByText("连接状态读取失败")).toBeInTheDocument();
    // 「软件自带浏览器」同时是上方控制卡的标题，这里只查连接状态那一块。
    const status = screen.getByLabelText("连接状态");
    expect(within(status).getByText("软件自带浏览器")).toBeInTheDocument();
  });
});
