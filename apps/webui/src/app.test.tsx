import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./app";
import {
  checkHealth,
  deleteCollectedPost,
  getSettings,
  listClientRecords,
  listCollectedPosts,
  listTasks,
  retryTask,
  submitDetail,
  submitTask,
  updateSettings,
} from "./lib/api";
import {
  makeDetailResponse,
  makeDownloadTask,
  makeSettingsResponse,
} from "./test/fixtures";

vi.mock("./lib/api", () => ({
  checkHealth: vi.fn(),
  deleteCollectedPost: vi.fn(),
  getSettings: vi.fn(),
  listClientRecords: vi.fn(),
  listCollectedPosts: vi.fn(),
  listTasks: vi.fn(),
  retryTask: vi.fn(),
  submitDetail: vi.fn(),
  submitTask: vi.fn(),
  updateSettings: vi.fn(),
}));

async function addSyntheticPost() {
  fireEvent.change(screen.getByLabelText("帖子链接"), {
    target: { value: " https://example.invalid/work " },
  });
  fireEvent.click(screen.getByRole("button", { name: "添加到列表" }));
  return screen.findByRole("button", {
    name: "打开帖子：合成测试帖子",
  });
}

describe("帖子下载工作台", () => {
  beforeEach(() => {
    vi.mocked(checkHealth).mockResolvedValue(true);
    vi.mocked(deleteCollectedPost).mockResolvedValue();
    vi.mocked(listClientRecords).mockResolvedValue([]);
    vi.mocked(listCollectedPosts).mockResolvedValue([]);
    vi.mocked(listTasks).mockResolvedValue([]);
    vi.mocked(getSettings).mockResolvedValue(makeSettingsResponse());
    vi.mocked(retryTask).mockResolvedValue(
      makeDownloadTask({ status: "queued" }),
    );
    vi.mocked(submitDetail).mockResolvedValue(makeDetailResponse());
    vi.mocked(submitTask).mockResolvedValue(makeDownloadTask());
    vi.mocked(updateSettings).mockResolvedValue(
      makeSettingsResponse({ restart_required: true }),
    );
  });

  it("解析帖子并以紧凑卡片加入瀑布流", async () => {
    render(<App />);

    expect(screen.getByText("帖子列表还是空的")).toBeInTheDocument();
    expect(await screen.findAllByText("服务已连接")).toHaveLength(2);
    await addSyntheticPost();

    expect(screen.getByText("1 个帖子 · 0 个已下载")).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByLabelText("帖子链接")).toHaveValue("");
    expect(submitDetail).toHaveBeenCalledWith({
      url: "https://example.invalid/work",
      download: false,
    });
  });

  it("在帖子详情中选择媒体并完成下载", async () => {
    render(<App />);
    fireEvent.click(await addSyntheticPost());

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.click(within(dialog).getByLabelText("选择第 2 项"));
    fireEvent.click(
      within(dialog).getByRole("switch", { name: "强制重新下载" }),
    );
    vi.mocked(submitTask).mockResolvedValue(
      makeDownloadTask({
        media_indexes: [1],
        artifacts: [
          {
            path: "download/synthetic.jpeg",
            sha256: "0".repeat(64),
            size: 2048,
            media_index: 1,
            kind: "图片",
          },
        ],
      }),
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "下载 1 项" }),
    );

    await waitFor(() =>
      expect(submitTask).toHaveBeenLastCalledWith({
        url: "https://example.invalid/work",
        index: [1],
        force: true,
        request_id: expect.any(String),
      }),
    );
    expect(await screen.findByText("1 个帖子 · 1 个已下载")).toBeInTheDocument();
    expect(within(dialog).getByText("已下载")).toBeInTheDocument();
  });

  it("支持搜索、筛选并从详情中移除帖子", async () => {
    render(<App />);
    await addSyntheticPost();

    fireEvent.change(screen.getByLabelText("搜索帖子"), {
      target: { value: "合成作者" },
    });
    expect(screen.getByText("合成测试帖子")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "待处理" }));
    expect(screen.getByText("合成测试帖子")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("搜索帖子"), {
      target: { value: "不存在" },
    });
    expect(screen.getByText("没有符合条件的帖子")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("搜索帖子"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "已下载" }));
    expect(screen.getByText("没有符合条件的帖子")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "全部" }));
    fireEvent.click(
      screen.getByRole("button", { name: "打开帖子：合成测试帖子" }),
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "移除帖子：合成测试帖子",
      }),
    );
    expect(
      await screen.findByText("帖子列表还是空的"),
    ).toBeInTheDocument();
  });

  it("为空链接和接口错误提供明确反馈", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "添加到列表" }));
    expect(await screen.findByText("请先粘贴一个帖子链接")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("帖子链接"), {
      target: { value: "invalid" },
    });
    vi.mocked(submitDetail).mockRejectedValue(new Error("链接无效"));
    fireEvent.click(screen.getByRole("button", { name: "添加到列表" }));
    expect(await screen.findByText("链接无效")).toBeInTheDocument();
    expect(await screen.findAllByText("服务未连接")).toHaveLength(2);
  });

  it("处理空详情、无标题帖子和非标准异常", async () => {
    render(<App />);
    const input = screen.getByLabelText("帖子链接");
    fireEvent.change(input, {
      target: { value: "https://example.invalid/work" },
    });

    vi.mocked(submitDetail).mockResolvedValueOnce(
      makeDetailResponse({ data: null }),
    );
    fireEvent.click(screen.getByRole("button", { name: "添加到列表" }));
    expect(
      await screen.findByText("接口没有返回帖子详情"),
    ).toBeInTheDocument();

    vi.mocked(submitDetail).mockRejectedValueOnce("未知异常");
    fireEvent.click(screen.getByRole("button", { name: "添加到列表" }));
    expect(await screen.findByText("帖子解析失败")).toBeInTheDocument();

    const untitled = makeDetailResponse();
    untitled.data!.作品标题 = "";
    untitled.data!.作品描述 = "";
    untitled.data!.作品标签 = [];
    untitled.data!.发布时间 = null;
    vi.mocked(submitDetail).mockResolvedValue(untitled);
    fireEvent.click(screen.getByRole("button", { name: "添加到列表" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "打开帖子：未命名帖子" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("发布时间未知")).toBeInTheDocument();
    expect(
      within(dialog).getByText("这个帖子没有文字描述。"),
    ).toBeInTheDocument();
  });

  it("下载失败时标记所选媒体并允许重试", async () => {
    render(<App />);
    fireEvent.click(await addSyntheticPost());
    const dialog = screen.getByRole("dialog");

    vi.mocked(submitTask).mockRejectedValueOnce(new Error("下载异常"));
    fireEvent.click(
      within(dialog).getByRole("button", { name: "下载 2 项" }),
    );
    expect(await screen.findByText("下载异常")).toBeInTheDocument();
    expect(within(dialog).getAllByText("失败")).toHaveLength(2);

    vi.mocked(submitTask).mockRejectedValueOnce("未知异常");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "下载 2 项" }),
    );
    expect(await screen.findByText("下载任务提交失败")).toBeInTheDocument();
  });

  it("统一展示后台任务和独立下载记录", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      makeDownloadTask({
        status: "failed",
        message: "合成任务失败",
      }),
    ]);
    vi.mocked(listClientRecords).mockResolvedValue([
      {
        record_id: "synthetic-record",
        work_id: "synthetic-work",
        source_url: "https://example.invalid/work",
        title: "合成独立记录",
        mode: "browser",
        status: "completed",
        media_indexes: [1],
        created_at: "2026-01-01T00:00:00Z",
        message: "浏览器下载完成",
      },
    ]);
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: /下载任务/ }),
    );
    expect(screen.getByText("合成任务失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() =>
      expect(retryTask).toHaveBeenCalledWith("synthetic-task"),
    );

    fireEvent.click(screen.getByRole("button", { name: /独立记录/ }));
    expect(screen.getByText("合成独立记录")).toBeInTheDocument();
    expect(screen.getByText("浏览器下载完成")).toBeInTheDocument();
  });

  it("从管理后台更新服务配置", async () => {
    render(<App />);

    fireEvent.click(
      await screen.findByRole("button", { name: "服务配置" }),
    );
    fireEvent.change(screen.getByLabelText("媒体目录名"), {
      target: { value: "media" },
    });
    fireEvent.change(screen.getByLabelText("小红书 Cookie"), {
      target: { value: "session=synthetic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          folder_name: "media",
          cookie: "session=synthetic",
        }),
      ),
    );
    expect(
      await screen.findByText(
        "配置已保存；可热更新字段已生效，其余配置重启后生效",
      ),
    ).toBeInTheDocument();
  });

});
