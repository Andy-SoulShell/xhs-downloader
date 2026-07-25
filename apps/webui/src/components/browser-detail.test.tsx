import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { FeedDetailResult } from "../lib/types";
import { BrowserDetail } from "./browser-detail";

it("为空资料和评论提供稳定回退文案", () => {
  const onClose = vi.fn();
  const detail: FeedDetailResult = {
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

  render(
    <BrowserDetail
      busy={false}
      detail={detail}
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
