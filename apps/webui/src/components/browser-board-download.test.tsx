import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JsonValue } from "@xhs-downloader/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { executeBrowserOperation, executeReadCapability } from "../lib/browser-api";
import { listBrowserExtensions, listBrowserTasks } from "../lib/browser-management-api";
import { useManagedBrowser } from "../lib/use-managed-browser";
import {
  browserDetailFixture,
  browserFeedFixture,
  browserReadRouteFixture,
  makeBrowserFeedList,
  makeCompletedBrowserTask,
} from "../test/browser-explorer-fixtures";
import { makeManagedBrowserControl } from "../test/managed-browser";
import { BrowserBoard } from "./browser-board";

vi.mock("../lib/browser-api", () => ({
  deleteCookies: vi.fn(),
  executeBrowserOperation: vi.fn(),
  executeReadCapability: vi.fn(),
}));
vi.mock("../lib/browser-management-api", () => ({
  listBrowserExtensions: vi.fn(),
  listBrowserTasks: vi.fn(),
  retryBrowserTask: vi.fn(),
}));
vi.mock("../lib/use-managed-browser", () => ({
  useManagedBrowser: vi.fn(),
}));

describe("浏览结果就地下载", () => {
  beforeEach(() => {
    vi.mocked(useManagedBrowser).mockReturnValue(makeManagedBrowserControl());
    vi.mocked(listBrowserExtensions).mockResolvedValue([]);
    vi.mocked(listBrowserTasks).mockResolvedValue([]);
    vi.mocked(executeBrowserOperation).mockImplementation(async (path) => {
      const data: Record<string, JsonValue> =
        path === "/xhs/login/status"
          ? {
              logged_in: true,
              user_id: "synthetic-user",
              nickname: "合成账号",
            }
          : {};
      return { task: makeCompletedBrowserTask(data), data } as never;
    });
    vi.mocked(executeReadCapability).mockImplementation(async (path) => {
      const data = path === "/xhs/feeds/detail" ? browserDetailFixture : makeBrowserFeedList();
      return { data, route: browserReadRouteFixture } as never;
    });
  });

  it("浏览结果可以就地下载并带上访问上下文", async () => {
    const onDownload = vi.fn(async () => undefined);
    vi.mocked(executeReadCapability).mockResolvedValue({
      data: makeBrowserFeedList(),
      route: browserReadRouteFixture,
    });
    render(<BrowserBoard browserDriver="extension" onDownload={onDownload} />);

    fireEvent.click(screen.getByRole("button", { name: "看看推荐" }));
    fireEvent.click(await screen.findByRole("button", { name: "下载" }));

    await waitFor(() =>
      expect(onDownload).toHaveBeenCalledWith(
        expect.stringContaining(`xiaohongshu.com/explore/${browserFeedFixture.feed_id}`),
        browserFeedFixture.title,
      ),
    );
    expect(onDownload).toHaveBeenCalledWith(
      expect.stringContaining("xsec_token="),
      expect.any(String),
    );
  });

  it("缺少访问上下文的结果说明原因而不是静默失效", async () => {
    vi.mocked(executeReadCapability).mockResolvedValue({
      data: {
        ...makeBrowserFeedList(),
        items: [{ ...browserFeedFixture, xsec_token: "" }],
      },
      route: browserReadRouteFixture,
    });
    render(<BrowserBoard browserDriver="extension" onDownload={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "看看推荐" }));

    expect(await screen.findByText("这条暂时打不开，重新搜索一下试试。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "下载" })).toBeNull();
  });

  it("还有更多结果时提供加载更多并追加去重", async () => {
    vi.mocked(executeReadCapability)
      .mockResolvedValueOnce({
        data: { ...makeBrowserFeedList(), cursor: "c1", has_more: true },
        route: browserReadRouteFixture,
      })
      .mockResolvedValueOnce({
        data: {
          ...makeBrowserFeedList(),
          items: [
            browserFeedFixture,
            { ...browserFeedFixture, feed_id: "second", title: "第二页帖子" },
          ],
          cursor: "c2",
          has_more: false,
        },
        route: browserReadRouteFixture,
      });
    render(<BrowserBoard browserDriver="extension" onDownload={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "看看推荐" }));
    fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));

    expect(await screen.findByText("第二页帖子")).toBeInTheDocument();
    // 首页已有的帖子不会重复出现。
    expect(screen.getAllByText(browserFeedFixture.title)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("button", { name: "加载更多" })).toBeNull());
  });
});
