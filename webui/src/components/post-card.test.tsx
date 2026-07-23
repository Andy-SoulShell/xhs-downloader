import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostRecord } from "../app";
import { makeDetailResponse } from "../test/fixtures";
import { PostCard } from "./post-card";

afterEach(() => vi.restoreAllMocks());

function makePost(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "synthetic-work",
    result: makeDetailResponse(),
    selected: new Set([1, 2]),
    downloaded: new Set(),
    force: false,
    status: "ready",
    ...overrides,
  };
}

describe("帖子卡片", () => {
  it("以图片预览动态图片组，并把动态形态显示为标签", () => {
    const onSelectionChange = vi.fn();
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    render(
      <PostCard
        onDownload={vi.fn()}
        onForceChange={vi.fn()}
        onRemove={vi.fn()}
        onSelectionChange={onSelectionChange}
        post={makePost()}
      />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    const livePreview = screen.getByLabelText(
      "合成测试帖子的第 1 个动态图片预览",
    );
    const liveButton = screen.getByRole("button", { name: "动态图片" });
    expect(livePreview).toBeInTheDocument();
    fireEvent.mouseEnter(livePreview.parentElement!);
    expect(play).toHaveBeenCalledOnce();
    expect(liveButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.mouseLeave(livePreview.parentElement!);
    expect(pause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText("取消全选"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set());
  });

  it("支持重新全选、切换媒体和触发下载", () => {
    const onSelectionChange = vi.fn();
    const onDownload = vi.fn();
    render(
      <PostCard
        onDownload={onDownload}
        onForceChange={vi.fn()}
        onRemove={vi.fn()}
        onSelectionChange={onSelectionChange}
        post={makePost({ selected: new Set() })}
      />,
    );

    fireEvent.click(screen.getByText("选择全部"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set([1, 2]));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([1]));
    expect(screen.getByRole("button", { name: "请选择媒体" })).toBeDisabled();
    expect(onDownload).not.toHaveBeenCalled();
  });

  it("直接在媒体项展示下载状态", () => {
    render(
      <PostCard
        onDownload={vi.fn()}
        onForceChange={vi.fn()}
        onRemove={vi.fn()}
        onSelectionChange={vi.fn()}
        post={makePost({
          status: "done",
          downloaded: new Set(["1:图片"]),
          result: makeDetailResponse({
            skipped: true,
            files: [
              {
                path: "small.jpeg",
                sha256: "1".repeat(64),
                size: 512,
                media_index: 1,
                kind: "图片",
              },
              {
                path: "large.mp4",
                sha256: "2".repeat(64),
                size: 2 * 1024 * 1024,
                media_index: 2,
                kind: "视频",
              },
            ],
          }),
        })}
      />,
    );

    expect(screen.getByText("已下载")).toBeInTheDocument();
    expect(screen.getByText("未下载")).toBeInTheDocument();
    expect(screen.queryByText("下载记录")).not.toBeInTheDocument();
  });

  it("没有详情时不渲染无效卡片", () => {
    const { container } = render(
      <PostCard
        onDownload={vi.fn()}
        onForceChange={vi.fn()}
        onRemove={vi.fn()}
        onSelectionChange={vi.fn()}
        post={makePost({ result: makeDetailResponse({ data: null }) })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
