import { fireEvent, render, screen, within } from "@testing-library/react";
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

function renderCard(
  post = makePost(),
  onSelectionChange = vi.fn(),
  onDownload = vi.fn(),
) {
  render(
    <PostCard
      onDownload={onDownload}
      onForceChange={vi.fn()}
      onRemove={vi.fn()}
      onSelectionChange={onSelectionChange}
      post={post}
    />,
  );
  return { onDownload, onSelectionChange };
}

describe("帖子卡片", () => {
  it("首页仅展示封面，点击后打开双栏媒体详情", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    renderCard();

    expect(
      screen.getByAltText("合成测试帖子的第 1 张图片"),
    ).toBeInTheDocument();
    expect(screen.getByAltText("合成作者的头像")).toHaveAttribute(
      "src",
      "https://example.invalid/avatar.jpeg",
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    const livePreview = screen.getByLabelText(
      "合成测试帖子的第 1 个动态图片预览",
    );
    fireEvent.mouseEnter(livePreview.parentElement!);
    expect(play).toHaveBeenCalledOnce();
    fireEvent.mouseLeave(livePreview.parentElement!);
    expect(pause).toHaveBeenCalledOnce();

    fireEvent.click(
      screen.getByRole("button", { name: "打开帖子：合成测试帖子" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    const liveMedia = within(dialog).getByLabelText(
      "第 1 项动态图片预览",
    );
    Object.defineProperties(liveMedia, {
      videoHeight: { configurable: true, value: 1280 },
      videoWidth: { configurable: true, value: 720 },
    });
    fireEvent.loadedMetadata(liveMedia);
    expect(liveMedia.parentElement).toHaveStyle({ aspectRatio: 720 / 1280 });
    fireEvent.click(within(dialog).getByRole("button", { name: "下一项" }));
    const imageMedia = within(dialog).getByAltText("第 2 项图片预览");
    Object.defineProperties(imageMedia, {
      naturalHeight: { configurable: true, value: 1200 },
      naturalWidth: { configurable: true, value: 800 },
    });
    fireEvent.load(imageMedia);
    expect(imageMedia.parentElement).toHaveStyle({ aspectRatio: 800 / 1200 });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "关闭详情" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("支持全选、单项选择和空选择保护", () => {
    const onSelectionChange = vi.fn();
    const { onDownload } = renderCard(
      makePost({ selected: new Set() }),
      onSelectionChange,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "打开帖子：合成测试帖子" }),
    );
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByText("选择全部"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set([1, 2]));
    fireEvent.click(within(dialog).getByText("第 2 项 · 图片"));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([2]));
    expect(
      within(dialog).getByAltText("第 2 项图片预览"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "请选择媒体" }),
    ).toBeDisabled();
    expect(onDownload).not.toHaveBeenCalled();
  });

  it("在卡片和详情中就地展示下载状态", () => {
    renderCard(
      makePost({
        status: "done",
        downloaded: new Set(["1:图片"]),
      }),
    );

    expect(screen.getByText("已下载")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "打开帖子：合成测试帖子" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("已下载")).toBeInTheDocument();
    expect(within(dialog).getByText("未下载")).toBeInTheDocument();
    expect(screen.queryByText("下载记录")).not.toBeInTheDocument();
  });

  it("为视频使用封面并支持键盘切换媒体", () => {
    const result = makeDetailResponse();
    result.data!.媒体 = [
      {
        序号: 1,
        类型: "视频",
        地址: "https://example.invalid/video.mp4",
        扩展名: "mp4",
        预览地址: "https://example.invalid/cover.jpeg",
      },
      {
        序号: 2,
        类型: "图片",
        地址: "https://example.invalid/image.jpeg",
        扩展名: "jpeg",
      },
    ];
    renderCard(makePost({ result }));

    const cover = screen.getByLabelText("合成测试帖子的第 1 个视频");
    expect(cover).toHaveAttribute(
      "poster",
      "https://example.invalid/cover.jpeg",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "打开帖子：合成测试帖子" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(
      within(dialog).getByAltText("第 2 项图片预览"),
    ).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(within(dialog).getByLabelText("第 1 项视频预览")).toHaveAttribute(
      "poster",
      "https://example.invalid/cover.jpeg",
    );
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
