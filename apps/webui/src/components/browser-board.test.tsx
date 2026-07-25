import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JsonValue } from "@xhs-downloader/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  executeBrowserOperation,
  executeReadCapability,
} from "../lib/browser-api";
import {
  listBrowserExtensions,
  listBrowserTasks,
} from "../lib/browser-management-api";
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

describe("浏览器探索工作台", () => {
  beforeEach(() => {
    vi.mocked(useManagedBrowser).mockReturnValue(
      makeManagedBrowserControl(),
    );
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
      const data =
        path === "/xhs/feeds/detail"
          ? browserDetailFixture
          : makeBrowserFeedList();
      return { data, route: browserReadRouteFixture } as never;
    });
  });

  it("检查登录、读取推荐、搜索并打开详情", async () => {
    render(<BrowserBoard browserDriver="extension" />);

    fireEvent.click(screen.getByRole("button", { name: "检查登录" }));
    expect(await screen.findByText("已登录 · 合成账号")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "读取推荐" }));
    expect(await screen.findByText("合成浏览帖子")).toBeInTheDocument();
    expect(
      screen.getByText("来源：受管浏览器 · 已回退"),
    ).toHaveAttribute("title", "Cookie HTTP 尚未配置");

    fireEvent.change(screen.getByLabelText("搜索小红书帖子"), {
      target: { value: " 合成关键词 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() =>
      expect(executeReadCapability).toHaveBeenCalledWith(
        "/xhs/feeds/search",
        { keyword: "合成关键词", filters: {} },
        expect.any(AbortSignal),
      ),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "读取帖子详情：合成浏览帖子" }),
    );
    expect(await screen.findByText("合成详情")).toBeInTheDocument();
    expect(screen.getByText("合成评论")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("确认要点赞吗");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    fireEvent.click(screen.getByRole("button", { name: "点赞" }));
    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
    await waitFor(() =>
      expect(executeBrowserOperation).toHaveBeenCalledWith(
        "/xhs/feeds/like",
        expect.objectContaining({ active: true }),
        expect.any(AbortSignal),
      ),
    );
    expect(screen.getByText("来源：受管浏览器 · 已回退")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "收藏" }));
    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
    await waitFor(() =>
      expect(executeBrowserOperation).toHaveBeenCalledWith(
        "/xhs/feeds/favorite",
        expect.objectContaining({ active: true }),
        expect.any(AbortSignal),
      ),
    );

    fireEvent.change(screen.getByLabelText("发表评论"), {
      target: { value: " 合成新评论 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "评论" }));
    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
    await waitFor(() =>
      expect(executeBrowserOperation).toHaveBeenCalledWith(
        "/xhs/feeds/comment",
        expect.objectContaining({ content: "合成新评论" }),
        expect.any(AbortSignal),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "回复" }));
    fireEvent.change(screen.getByLabelText("回复评论"), {
      target: { value: "合成新回复" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "回复" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "确认执行" }));
    await waitFor(() =>
      expect(executeBrowserOperation).toHaveBeenCalledWith(
        "/xhs/feeds/comment/reply",
        expect.objectContaining({
          comment_id: "synthetic-comment",
          content: "合成新回复",
        }),
        expect.any(AbortSignal),
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "关闭帖子详情" }));
    await waitFor(() =>
      expect(executeReadCapability).toHaveBeenLastCalledWith(
        "/xhs/feeds/list",
        {},
        expect.any(AbortSignal),
      ),
    );
  });

  it("显示任务错误并阻止空关键词搜索", async () => {
    vi.mocked(executeReadCapability).mockRejectedValueOnce(
      new Error("浏览器扩展未连接"),
    );
    render(<BrowserBoard browserDriver="extension" />);

    expect(screen.getByRole("button", { name: "搜索" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "读取推荐" }));

    expect(
      await screen.findByText("浏览器扩展未连接"),
    ).toBeInTheDocument();
  });

  it("只展示脱敏账号一致性结论", async () => {
    vi.mocked(executeReadCapability).mockResolvedValueOnce({
      data: makeBrowserFeedList(),
      route: {
        ...browserReadRouteFixture,
        account_consistency: "matched",
      },
    });
    render(<BrowserBoard browserDriver="extension" />);

    fireEvent.click(screen.getByRole("button", { name: "读取推荐" }));

    expect(
      await screen.findByText("账号一致性已确认"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("synthetic-user");
  });

  it("处理未登录、无封面和非标准异常", async () => {
    vi.mocked(executeBrowserOperation)
      .mockResolvedValueOnce({
        task: makeCompletedBrowserTask({
          logged_in: false,
          user_id: null,
          nickname: null,
        }),
        data: { logged_in: false, user_id: null, nickname: null },
      })
      .mockRejectedValueOnce("非标准异常");
    vi.mocked(executeReadCapability).mockResolvedValueOnce({
      route: browserReadRouteFixture,
      data: {
        items: [
          {
            ...browserFeedFixture,
            xsec_token: "",
            title: "",
            author: { ...browserFeedFixture.author, nickname: "" },
            cover_url: null,
          },
        ],
        source: "home",
        keyword: null,
      },
    });
    render(<BrowserBoard browserDriver="extension" />);

    fireEvent.click(screen.getByRole("button", { name: "检查登录" }));
    expect(await screen.findByText("尚未登录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "读取推荐" }));
    expect(await screen.findByText("暂无封面")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "读取帖子详情：未命名帖子" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "检查登录" }));
    expect(await screen.findByText("能力请求执行失败")).toBeInTheDocument();
  });

  it("执行器未确认时只允许读取并禁用会话与写操作", async () => {
    render(<BrowserBoard />);

    expect(
      screen.getByText("浏览器执行器尚未确认，登录与写操作已停用"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "检查登录" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "获取登录二维码" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "清除浏览器 Cookie" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "读取推荐" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "读取帖子详情：合成浏览帖子",
      }),
    );

    expect(await screen.findByRole("button", { name: "点赞" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "收藏" })).toBeDisabled();
    expect(screen.getByLabelText("发表评论")).toBeDisabled();
    expect(screen.getByRole("button", { name: "评论" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "回复" })).toBeDisabled();
  });
});
