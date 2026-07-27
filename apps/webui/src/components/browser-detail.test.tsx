import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { FeedDetailResult } from "../lib/types";
import { BrowserDetail } from "./browser-detail";

function makeDetail(): FeedDetailResult {
  return {
    feed_id: "synthetic-feed",
    xsec_token: "synthetic-token",
    title: "",
    body: "",
    note_type: "unknown",
    author: {
      user_id: "synthetic-author",
      nickname: "",
      avatar_url: null,
    },
    metrics: {
      liked: false,
      liked_count: "0",
      collected: false,
      collected_count: "0",
      comment_count: "0",
      shared_count: "0",
    },
    image_urls: [],
    published_at: null,
    ip_location: "",
    comments: [],
    comments_has_more: false,
    comments_cursor: "",
  };
}

it("为空资料和评论提供稳定回退文案", () => {
  const onClose = vi.fn();

  render(
    <BrowserDetail
      busy={false}
      detail={makeDetail()}
      onClose={onClose}
      onComment={vi.fn()}
      onReply={vi.fn()}
      onSetFavorite={vi.fn()}
      onSetLike={vi.fn()}
    />,
  );

  expect(screen.getByText("未知作者")).toBeInTheDocument();
  expect(screen.getByText("位置未知")).toBeInTheDocument();
  expect(screen.getByText("未命名帖子")).toBeInTheDocument();
  expect(screen.getByText("这个帖子没有文字描述。")).toBeInTheDocument();
  expect(screen.getByText("当前没有已加载评论。")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "关闭帖子详情" }));
  expect(onClose).toHaveBeenCalled();
});

it("连接方式不支持评论时停用输入并说明原因", () => {
  render(
    <BrowserDetail
      busy={false}
      commentEnabled={false}
      detail={makeDetail()}
      onClose={vi.fn()}
      onComment={vi.fn()}
      onReply={vi.fn()}
      onSetFavorite={vi.fn()}
      onSetLike={vi.fn()}
    />,
  );

  expect(
    screen.getByText("软件自带浏览器尚未支持评论与回复，请切换到浏览器扩展连接方式。"),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("发表评论")).toBeDisabled();
  expect(screen.getByRole("button", { name: "评论" })).toBeDisabled();
  // 点赞与收藏由软件自带浏览器实现，不受评论限制影响。
  expect(screen.getByRole("button", { name: "点赞" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "收藏" })).toBeEnabled();
});

it("评论失败保留已写内容，成功才清空", async () => {
  const onComment = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

  render(
    <BrowserDetail
      busy={false}
      detail={makeDetail()}
      onClose={vi.fn()}
      onComment={onComment}
      onReply={vi.fn()}
      onSetFavorite={vi.fn()}
      onSetLike={vi.fn()}
      writeEnabled
    />,
  );

  const input = screen.getByLabelText("发表评论");
  fireEvent.change(input, { target: { value: "合成评论" } });
  fireEvent.click(screen.getByRole("button", { name: "评论" }));
  fireEvent.click(await screen.findByRole("button", { name: "确认执行" }));

  // 失败时清空等于让人白写一遍。
  await waitFor(() => expect(onComment).toHaveBeenCalledWith("合成评论"));
  expect(input).toHaveValue("合成评论");

  fireEvent.click(screen.getByRole("button", { name: "评论" }));
  fireEvent.click(await screen.findByRole("button", { name: "确认执行" }));
  await waitFor(() => expect(input).toHaveValue(""));
});
