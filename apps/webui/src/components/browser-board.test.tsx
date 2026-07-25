import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JsonValue } from "@xhs-downloader/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserTask } from "../lib/types";
import {
  executeBrowserOperation,
  executeReadCapability,
  type CapabilityRoute,
} from "../lib/browser-api";
import {
  listBrowserExtensions,
  listBrowserTasks,
} from "../lib/browser-management-api";
import { useManagedBrowser } from "../lib/use-managed-browser";
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

const feed = {
  feed_id: "synthetic-feed",
  xsec_token: "synthetic-token",
  title: "合成浏览帖子",
  note_type: "image" as const,
  author: {
    user_id: "synthetic-author",
    nickname: "合成作者",
    avatar_url: null,
  },
  metrics: {
    liked: false,
    liked_count: "12",
    collected: false,
    collected_count: "3",
    comment_count: "4",
    shared_count: "1",
  },
  cover_url: "https://example.invalid/cover.png",
  cover_width: 1080,
  cover_height: 1440,
  video_duration: null,
};

const readRoute = {
  provider: "browser",
  strategy: "http_first",
  browser_driver: "managed",
  fallback_used: true,
  fallback_reason: {
    provider: "http",
    code: "not_configured",
    message: "Cookie HTTP 尚未配置",
  },
  attempted_providers: ["http", "browser"],
} satisfies CapabilityRoute;

function completedTask(result: Record<string, JsonValue>): BrowserTask {
  return {
    task_id: "synthetic-browser-task",
    request_id: "synthetic-request",
    kind: "list_feeds",
    payload: {},
    status: "succeeded",
    result,
    target_driver: "extension",
    executor_id: "synthetic-extension",
    extension_id: "synthetic-extension",
    lease_expires_at: null,
    attempts: 1,
    message: "合成任务完成",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

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
      return { task: completedTask(data), data } as never;
    });
    vi.mocked(executeReadCapability).mockImplementation(async (path) => {
      const data = (
        path === "/xhs/feeds/detail"
          ? {
              feed_id: feed.feed_id,
              xsec_token: feed.xsec_token,
              title: "合成详情",
              body: "仅用于自动化测试",
              note_type: "image",
              author: feed.author,
              metrics: feed.metrics,
              image_urls: [],
              published_at: null,
              ip_location: "合成地点",
              comments: [
                {
                  comment_id: "synthetic-comment",
                  content: "合成评论",
                  author: feed.author,
                  liked: false,
                  like_count: "0",
                  created_at: null,
                  ip_location: "",
                  reply_count: "0",
                  replies: [],
                },
              ],
              comments_has_more: false,
              comments_cursor: "",
            }
          : { items: [feed], source: "home", keyword: null }
      ) as Record<string, JsonValue>;
      return { data, route: readRoute } as never;
    });
  });

  it("检查登录、读取推荐、搜索并打开详情", async () => {
    render(<BrowserBoard />);

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
    render(<BrowserBoard />);

    expect(screen.getByRole("button", { name: "搜索" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "读取推荐" }));

    expect(
      await screen.findByText("浏览器扩展未连接"),
    ).toBeInTheDocument();
  });

  it("处理未登录、无封面和非标准异常", async () => {
    vi.mocked(executeBrowserOperation)
      .mockResolvedValueOnce({
        task: completedTask({
          logged_in: false,
          user_id: null,
          nickname: null,
        }),
        data: { logged_in: false, user_id: null, nickname: null },
      })
      .mockRejectedValueOnce("非标准异常");
    vi.mocked(executeReadCapability).mockResolvedValueOnce({
      route: readRoute,
      data: {
        items: [
          {
            ...feed,
            xsec_token: "",
            title: "",
            author: { ...feed.author, nickname: "" },
            cover_url: null,
          },
        ],
        source: "home",
        keyword: null,
      },
    });
    render(<BrowserBoard />);

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
});
