import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./app";
import { checkHealth, submitDetail } from "./lib/api";
import type { DetailResponse } from "./lib/types";

vi.mock("./lib/api", () => ({
  checkHealth: vi.fn(),
  submitDetail: vi.fn(),
}));

const detailResponse: DetailResponse = {
  message: "作品信息解析完成",
  data: {
    作品ID: "synthetic-work",
    作品链接: "https://example.invalid/work",
    作品标题: "合成测试作品",
    作品描述: "完全合成的测试文本",
    作品类型: "图文",
    作品标签: ["测试"],
    发布时间: "2024-01-02T03:04:05Z",
    最后更新时间: null,
    点赞数量: "10",
    收藏数量: "2",
    评论数量: "1",
    分享数量: "0",
    作者: {
      作者ID: "synthetic-author",
      作者昵称: "合成作者",
      作者链接: "https://example.invalid/author",
    },
    媒体: [
      {
        序号: 1,
        类型: "图片",
        地址: "https://example.invalid/image",
        扩展名: "jpeg",
      },
    ],
  },
  files: [],
  skipped: false,
};

describe("下载工作台", () => {
  beforeEach(() => {
    vi.mocked(checkHealth).mockResolvedValue(true);
    vi.mocked(submitDetail).mockResolvedValue(detailResponse);
  });

  it("解析详情后可选择媒体并发起强制下载", async () => {
    render(<App />);

    expect(await screen.findByText("服务已连接")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("作品链接"), {
      target: { value: " https://example.invalid/work " },
    });
    fireEvent.click(screen.getByRole("button", { name: "解析作品" }));

    expect(await screen.findByText("合成测试作品")).toBeInTheDocument();
    expect(submitDetail).toHaveBeenLastCalledWith({
      url: "https://example.invalid/work",
      download: false,
      force: false,
      index: undefined,
    });

    fireEvent.click(screen.getByRole("radio", { name: "下载媒体" }));
    fireEvent.click(screen.getByText("图片"));
    fireEvent.click(screen.getByRole("switch"));
    vi.mocked(submitDetail).mockResolvedValue({
      ...detailResponse,
      message: "作品文件下载完成",
      files: [
        {
          path: "download/synthetic.jpeg",
          sha256: "0".repeat(64),
          size: 2048,
          media_index: 1,
          kind: "图片",
        },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "开始下载" }));

    await waitFor(() =>
      expect(submitDetail).toHaveBeenLastCalledWith({
        url: "https://example.invalid/work",
        download: true,
        force: true,
        index: [1],
      }),
    );
    expect(await screen.findByText("2.0 KB")).toBeInTheDocument();
  });

  it("阻止空链接并展示请求错误", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "解析作品" }));
    expect(
      await screen.findByText("请先粘贴一个小红书作品链接"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("作品链接"), {
      target: { value: "invalid" },
    });
    vi.mocked(submitDetail).mockRejectedValue(new Error("链接无效"));
    fireEvent.click(screen.getByRole("button", { name: "解析作品" }));

    expect(await screen.findByText("链接无效")).toBeInTheDocument();
    expect(await screen.findByText("服务未连接")).toBeInTheDocument();
  });
});
