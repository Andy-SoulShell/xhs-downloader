import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { JsonValue } from "@xhs-downloader/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserTask, FeedDetailResult } from "../lib/types";
import { executeBrowserOperation } from "../lib/browser-api";
import { BrowserBoard } from "./browser-board";
import { BrowserDetail } from "./browser-detail";

vi.mock("../lib/browser-api", () => ({
  executeBrowserOperation: vi.fn(),
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

function completedTask(result: Record<string, JsonValue>): BrowserTask {
  return {
    task_id: "synthetic-browser-task",
    request_id: "synthetic-request",
    kind: "list_feeds",
    payload: {},
    status: "succeeded",
    result,
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
    vi.mocked(executeBrowserOperation).mockImplementation(async (path) => {
      const data = (
        path === "/xhs/login/status"
          ? {
              logged_in: true,
              user_id: "synthetic-user",
              nickname: "合成账号",
            }
          : path === "/xhs/feeds/detail"
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
      return { task: completedTask(data), data } as never;
    });
  });

  it("检查登录、读取推荐、搜索并打开详情", async () => {
    render(<BrowserBoard />);

    fireEvent.click(screen.getByRole("button", { name: "检查登录" }));
    expect(await screen.findByText("已登录 · 合成账号")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "读取推荐" }));
    expect(await screen.findByText("合成浏览帖子")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("搜索小红书帖子"), {
      target: { value: " 合成关键词 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    await waitFor(() =>
      expect(executeBrowserOperation).toHaveBeenCalledWith(
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
    fireEvent.click(screen.getByRole("button", { name: "关闭帖子详情" }));
    await waitFor(() =>
      expect(executeBrowserOperation).toHaveBeenLastCalledWith(
        "/xhs/feeds/list",
        {},
        expect.any(AbortSignal),
      ),
    );
  });

  it("显示任务错误并阻止空关键词搜索", async () => {
    vi.mocked(executeBrowserOperation).mockRejectedValueOnce(
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
      .mockResolvedValueOnce({
        task: completedTask({ items: [], source: "home", keyword: null }),
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
      })
      .mockRejectedValueOnce("非标准异常");
    render(<BrowserBoard />);

    fireEvent.click(screen.getByRole("button", { name: "检查登录" }));
    expect(await screen.findByText("尚未登录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "读取推荐" }));
    expect(await screen.findByText("暂无封面")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "读取帖子详情：未命名帖子" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "检查登录" }));
    expect(await screen.findByText("浏览器任务执行失败")).toBeInTheDocument();
  });
});

describe("浏览器帖子详情", () => {
  it("为空资料和评论提供稳定回退文案", () => {
    const onClose = vi.fn();
    const detail: FeedDetailResult = {
      feed_id: feed.feed_id,
      xsec_token: feed.xsec_token,
      title: "",
      body: "",
      note_type: "unknown",
      author: { ...feed.author, nickname: "" },
      metrics: feed.metrics,
      image_urls: [],
      published_at: null,
      ip_location: "",
      comments: [],
      comments_has_more: false,
      comments_cursor: "",
    };

    render(<BrowserDetail detail={detail} onClose={onClose} />);

    expect(screen.getByText("未知作者")).toBeInTheDocument();
    expect(screen.getByText("位置未知")).toBeInTheDocument();
    expect(screen.getByText("未命名帖子")).toBeInTheDocument();
    expect(screen.getByText("这个帖子没有文字描述。")).toBeInTheDocument();
    expect(screen.getByText("当前没有已加载评论。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭帖子详情" }));
    expect(onClose).toHaveBeenCalled();
  });
});
