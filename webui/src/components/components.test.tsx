import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DetailResponse, MediaResource } from "../lib/types";
import { MediaPicker } from "./media-picker";
import { ResultPanel } from "./result-panel";

const media: MediaResource[] = [
  {
    序号: 1,
    类型: "图片",
    地址: "https://example.invalid/image",
    扩展名: "jpeg",
  },
];

describe("媒体选择器", () => {
  it("没有媒体时不渲染选择区域", () => {
    const { container } = render(
      <MediaPicker media={[]} onChange={vi.fn()} selected={new Set()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("支持选择和取消选择媒体", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MediaPicker media={media} onChange={onChange} selected={new Set()} />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange.mock.calls[0][0]).toEqual(new Set([1]));

    rerender(
      <MediaPicker media={media} onChange={onChange} selected={new Set([1])} />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange.mock.calls[1][0]).toEqual(new Set());
  });
});

describe("结果面板", () => {
  it("展示复用状态、未知时间与不同文件大小", () => {
    const result: DetailResponse = {
      message: "已复用",
      skipped: true,
      data: {
        作品ID: "synthetic-work",
        作品链接: "https://example.invalid/work",
        作品标题: "",
        作品描述: "",
        作品类型: "图文",
        作品标签: [],
        发布时间: null,
        最后更新时间: null,
        点赞数量: "0",
        收藏数量: "0",
        评论数量: "0",
        分享数量: "0",
        作者: {
          作者ID: "synthetic-author",
          作者昵称: "合成作者",
          作者链接: "https://example.invalid/author",
        },
        媒体: media,
      },
      files: [
        {
          path: "small.jpeg",
          sha256: "1".repeat(64),
          size: 512,
          media_index: 1,
          kind: "图片",
        },
        {
          path: "medium.jpeg",
          sha256: "2".repeat(64),
          size: 2048,
          media_index: 2,
          kind: "图片",
        },
        {
          path: "large.mp4",
          sha256: "3".repeat(64),
          size: 2 * 1024 * 1024,
          media_index: 3,
          kind: "视频",
        },
      ],
    };

    render(<ResultPanel result={result} />);

    expect(screen.getByText("未命名作品")).toBeInTheDocument();
    expect(screen.getByText("这个作品没有文字描述。")).toBeInTheDocument();
    expect(screen.getByText("时间未知")).toBeInTheDocument();
    expect(screen.getByText("已复用本地产物")).toBeInTheDocument();
    expect(screen.getByText("512 B")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("2.0 MB")).toBeInTheDocument();
  });
});
