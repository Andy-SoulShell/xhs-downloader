import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MediaResource } from "../lib/types";
import { MediaViewer } from "./media-viewer";

const image: MediaResource = {
  序号: 1,
  类型: "图片",
  地址: "https://example.invalid/image",
  扩展名: "jpeg",
};

const video: MediaResource = {
  序号: 2,
  类型: "视频",
  地址: "https://example.invalid/video",
  扩展名: "mp4",
  预览地址: "https://example.invalid/poster",
};

function ViewerHarness() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(true);
  return (
    <MediaViewer
      activeIndex={activeIndex}
      media={[
        { index: 1, resources: [image] },
        { index: 2, resources: [video] },
      ]}
      onIndexChange={setActiveIndex}
      onOpenChange={setOpen}
      open={open}
    />
  );
}

describe("大图预览", () => {
  it("支持按钮和键盘切换前后媒体", () => {
    render(<ViewerHarness />);

    expect(screen.getByText("第 1 / 2 项 · 图片")).toBeInTheDocument();
    expect(screen.getByAltText("第 1 项图片大图")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一项" }));
    expect(screen.getByText("第 2 / 2 项 · 视频")).toBeInTheDocument();
    expect(screen.getByLabelText("第 2 项视频大图")).toBeInTheDocument();
    expect(screen.getByLabelText("第 2 项视频大图")).toHaveAttribute(
      "poster",
      video.预览地址,
    );
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText("第 1 / 2 项 · 图片")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("第 2 / 2 项 · 视频")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(
      screen.queryByText("第 2 / 2 项 · 视频"),
    ).not.toBeInTheDocument();
  });

  it("动态图片使用带封面的循环视频", () => {
    const live: MediaResource = {
      序号: 1,
      类型: "动态图片",
      地址: "https://example.invalid/live",
      扩展名: "mp4",
    };
    render(
      <MediaViewer
        activeIndex={0}
        media={[{ index: 1, resources: [image, live] }]}
        onIndexChange={() => undefined}
        onOpenChange={() => undefined}
        open
      />,
    );

    expect(screen.getByText("第 1 / 1 项 · 动态图片")).toBeInTheDocument();
    expect(screen.getByLabelText("第 1 项动态图片大图")).toHaveAttribute(
      "poster",
      image.地址,
    );
    expect(screen.getByRole("button", { name: "上一项" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一项" })).toBeDisabled();
  });

  it("没有媒体时不渲染预览层", () => {
    const { container } = render(
      <MediaViewer
        activeIndex={0}
        media={[]}
        onIndexChange={() => undefined}
        onOpenChange={() => undefined}
        open
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
