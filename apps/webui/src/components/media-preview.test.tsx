import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MediaResource } from "../lib/types";
import { MediaPreview } from "./media-preview";

const image: MediaResource = {
  序号: 1,
  类型: "图片",
  地址: "https://example.invalid/image",
  扩展名: "jpeg",
};

const live: MediaResource = {
  序号: 1,
  类型: "动态图片",
  地址: "https://example.invalid/live",
  扩展名: "mp4",
};

afterEach(() => vi.restoreAllMocks());

describe("媒体预览", () => {
  it("支持悬停和点击播放动态图片", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    render(
      <MediaPreview
        index={1}
        onOpen={vi.fn()}
        resources={[image, live]}
        title="合成帖子"
      />,
    );

    const preview = screen.getByLabelText("合成帖子的第 1 个动态图片预览");
    const button = screen.getByRole("button", { name: "动态图片" });
    fireEvent.mouseEnter(preview.parentElement!);
    expect(play).toHaveBeenCalledOnce();
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(pause).toHaveBeenCalledOnce();
    fireEvent.click(button);
    expect(play).toHaveBeenCalledTimes(2);
    fireEvent.mouseLeave(preview.parentElement!);
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it("播放失败时恢复静态预览", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(
      new Error("媒体不可用"),
    );
    render(
      <MediaPreview
        index={1}
        onOpen={vi.fn()}
        resources={[image, live]}
        title="合成帖子"
      />,
    );

    const button = screen.getByRole("button", { name: "动态图片" });
    fireEvent.click(button);
    await waitFor(() =>
      expect(button).toHaveAttribute("aria-pressed", "false"),
    );
  });

  it("普通图片不创建动态控件", () => {
    const onOpen = vi.fn();
    render(
      <MediaPreview
        index={1}
        onOpen={onOpen}
        resources={[image]}
        title="合成帖子"
      />,
    );

    expect(screen.getByRole("img")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看第 1 项大图" }));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "动态图片" }),
    ).not.toBeInTheDocument();
  });

  it("视频资源使用原生视频预览", () => {
    const video: MediaResource = {
      序号: 1,
      类型: "视频",
      地址: "https://example.invalid/video",
      扩展名: "mp4",
      预览地址: "https://example.invalid/poster",
    };
    const { rerender } = render(
      <MediaPreview
        index={1}
        onOpen={vi.fn()}
        resources={[video]}
        title="合成帖子"
      />,
    );

    expect(screen.getByLabelText("合成帖子的第 1 个视频")).toHaveAttribute(
      "src",
      video.地址,
    );
    expect(screen.getByLabelText("合成帖子的第 1 个视频")).toHaveAttribute(
      "poster",
      video.预览地址,
    );

    rerender(
      <MediaPreview
        index={1}
        onOpen={vi.fn()}
        resources={[live]}
        title="合成帖子"
      />,
    );
    expect(screen.getByLabelText("合成帖子的第 1 个视频")).toHaveAttribute(
      "src",
      live.地址,
    );
  });
});
