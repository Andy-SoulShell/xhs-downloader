import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PostRecord } from "../lib/workspace";
import { makeDetailResponse } from "../test/fixtures";
import { PostCard } from "./post-card";

afterEach(() => vi.restoreAllMocks());

/** 读取媒体所在展示台记下的宽高比。 */
function stageRatio(media: HTMLElement): string {
  return media.parentElement!.style.getPropertyValue("--detail-stage-ratio");
}

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

function renderCard(post = makePost(), onSelectionChange = vi.fn(), onDownload = vi.fn()) {
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
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    renderCard();

    expect(screen.getByAltText("合成测试帖子的第 1 张图片")).toBeInTheDocument();
    expect(screen.getByAltText("合成作者的头像")).toHaveAttribute(
      "src",
      "https://example.invalid/avatar.jpeg",
    );
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    const livePreview = screen.getByLabelText("合成测试帖子的第 1 个动态图片预览");
    fireEvent.mouseEnter(livePreview.parentElement!);
    expect(play).toHaveBeenCalledOnce();
    fireEvent.mouseLeave(livePreview.parentElement!);
    expect(pause).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "打开帖子：合成测试帖子" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    const liveMedia = within(dialog).getByLabelText("第 1 项动态图片预览");
    Object.defineProperties(liveMedia, {
      videoHeight: { configurable: true, value: 1280 },
      videoWidth: { configurable: true, value: 720 },
    });
    fireEvent.loadedMetadata(liveMedia);
    // 宽高比走自定义属性而不是内联 aspect-ratio：它只在宽屏断点下生效，见 styles.css。
    expect(stageRatio(liveMedia)).toBe(String(720 / 1280));
    fireEvent.click(within(dialog).getByRole("button", { name: "下一项" }));
    const imageMedia = within(dialog).getByAltText("第 2 项图片预览");
    Object.defineProperties(imageMedia, {
      naturalHeight: { configurable: true, value: 1200 },
      naturalWidth: { configurable: true, value: 800 },
    });
    fireEvent.load(imageMedia);
    expect(stageRatio(imageMedia)).toBe(String(800 / 1200));
    fireEvent.click(within(dialog).getByRole("button", { name: "关闭详情" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("支持全选、单项选择和空选择保护", () => {
    const onSelectionChange = vi.fn();
    const { onDownload } = renderCard(makePost({ selected: new Set() }), onSelectionChange);
    fireEvent.click(screen.getByRole("button", { name: "打开帖子：合成测试帖子" }));
    const dialog = screen.getByRole("dialog");

    fireEvent.click(within(dialog).getByText("选择全部"));
    expect(onSelectionChange).toHaveBeenCalledWith(new Set([1, 2]));
    fireEvent.click(within(dialog).getByText("第 2 项 · 图片"));
    expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([2]));
    expect(within(dialog).getByAltText("第 2 项图片预览")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "请选择媒体" })).toBeDisabled();
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
    fireEvent.click(screen.getByRole("button", { name: "打开帖子：合成测试帖子" }));
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

    const cover = screen.getByAltText("合成测试帖子的第 1 个视频封面");
    expect(cover).toHaveAttribute("src", "https://example.invalid/cover.jpeg");
    expect(cover).toHaveAttribute("referrerpolicy", "no-referrer");
    fireEvent.click(screen.getByRole("button", { name: "打开帖子：合成测试帖子" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(within(dialog).getByAltText("第 2 项图片预览")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(within(dialog).getByLabelText("第 1 项视频预览")).toHaveAttribute(
      "poster",
      "https://example.invalid/cover.jpeg",
    );
  });

  it("解析不出媒体的帖子仍然占位展示而不是静默消失", () => {
    const result = makeDetailResponse();
    result.data!.媒体 = [];
    const onRemove = vi.fn();
    render(
      <PostCard
        onDownload={vi.fn()}
        onForceChange={vi.fn()}
        onRemove={onRemove}
        onSelectionChange={vi.fn()}
        post={makePost({ result })}
      />,
    );

    // 静默返回 null 会让列表计数与实际卡片数对不上，用户既看不到这条帖子，
    // 也无从知道它为什么不见了。
    expect(screen.getByText("合成测试帖子")).toBeInTheDocument();
    expect(screen.getAllByText("没有解析到可下载媒体")).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "打开帖子：合成测试帖子" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("无可下载媒体")).toBeInTheDocument();
    // 详情必须给出出路：不能下载，至少要能移除。
    fireEvent.click(within(dialog).getByRole("button", { name: "移除帖子：合成测试帖子" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("详情大图加载失败时说明原因而不是留一片纯黑", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "打开帖子：合成测试帖子" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "下一项" }));

    const stage = within(dialog).getByAltText("第 2 项图片预览");
    fireEvent.error(stage);

    expect(within(dialog).getByText(/媒体地址已失效/)).toBeInTheDocument();
    expect(within(dialog).queryByAltText("第 2 项图片预览")).not.toBeInTheDocument();
  });

  it("下载失败时说明原因并把主按钮变成重试", () => {
    const result = makeDetailResponse();
    result.message = "下载目录没有写入权限，请在设置里换一个目录后重试。";
    renderCard(makePost({ result, status: "error" }));
    fireEvent.click(screen.getByRole("button", { name: "打开帖子：合成测试帖子" }));
    const dialog = screen.getByRole("dialog");

    // 此前失败原因只存在记录里从不展示，用户只能看到一个红色的“失败”。
    expect(within(dialog).getByRole("alert")).toHaveTextContent("写入权限");
    expect(within(dialog).getByRole("button", { name: /重试下载/ })).toBeEnabled();
  });

  it("数量未知时不把哨兵值显示给用户", () => {
    const result = makeDetailResponse();
    result.data!.点赞数量 = "-1";
    renderCard(makePost({ result }));

    // 领域模型用 "-1" 表示未取到数量，直接渲染会让界面出现 “♡ -1”。
    expect(screen.queryByText("-1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("赞数量未知")).toBeInTheDocument();
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
