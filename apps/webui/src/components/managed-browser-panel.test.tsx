import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makeManagedBrowserControl, makeManagedBrowserStatus } from "../test/managed-browser";
import { ManagedBrowserPanel } from "./managed-browser-panel";

describe("受管浏览器控制区", () => {
  it.each([
    [true, "正在检测", "正在检测本机 Chrome 或 Chromium。"],
    [false, "状态未知", "尚未取得受管浏览器状态。"],
  ] as const)("覆盖空状态与加载状态", (loading, state, message) => {
    render(
      <ManagedBrowserPanel
        control={makeManagedBrowserControl({ loading, status: null })}
        selected
      />,
    );

    expect(screen.getByText(state)).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启动" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "停止" })).toBeDisabled();
  });

  it("从停止状态启动并展示首次登录引导", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    render(<ManagedBrowserPanel control={makeManagedBrowserControl({ start })} selected />);

    expect(screen.getByText("已停止")).toBeInTheDocument();
    expect(screen.getByText(/首次使用请先启动/)).toBeInTheDocument();
    expect(screen.getByText(/独立登录资料会保存在本机/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "启动" }));
    expect(start).toHaveBeenCalledOnce();
  });

  it("运行时允许停止和刷新并显示服务端消息", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    render(
      <ManagedBrowserPanel
        control={makeManagedBrowserControl({
          refresh,
          stop,
          status: makeManagedBrowserStatus({
            state: "running",
            cdp_port: 9222,
            message: "专用浏览器已启动，登录状态将保存在本机",
          }),
        })}
        selected={false}
      />,
    );

    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.getByText("可选执行器")).toBeInTheDocument();
    expect(screen.getByText("专用浏览器已启动，登录状态将保存在本机")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    fireEvent.click(screen.getByRole("button", { name: "刷新受管浏览器状态" }));
    expect(stop).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("未安装时禁用启动并给出配置路径", () => {
    render(
      <ManagedBrowserPanel
        control={makeManagedBrowserControl({
          status: makeManagedBrowserStatus({
            installed: false,
            executable_name: null,
          }),
        })}
        selected
      />,
    );

    expect(screen.getByText("未检测到 Chrome 或 Chromium。")).toBeInTheDocument();
    expect(screen.getByText(/请安装 Chrome 或 Chromium/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启动" })).toBeDisabled();
  });

  it.each([
    [
      "受管浏览器用户目录已由另一个服务实例占用",
      "请关闭另一个正在使用此受管浏览器目录的 xhs-downloader 服务",
    ],
    ["专用浏览器启动失败", "请先刷新状态；若仍失败，请检查浏览器可执行文件设置"],
  ])("把操作错误转换为具体修复提示", (error, repair) => {
    render(<ManagedBrowserPanel control={makeManagedBrowserControl({ error })} selected />);

    expect(screen.getByText(error)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(repair))).toBeInTheDocument();
  });

  it("异常状态允许停止并提示重新启动", () => {
    render(
      <ManagedBrowserPanel
        control={makeManagedBrowserControl({
          status: makeManagedBrowserStatus({ state: "error" }),
        })}
        selected
      />,
    );

    expect(screen.getByText("异常")).toBeInTheDocument();
    expect(screen.getByText(/请先停止后重新启动/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "停止" })).toBeEnabled();
  });

  it("操作期间显示过渡状态并禁用全部控制", () => {
    render(
      <ManagedBrowserPanel control={makeManagedBrowserControl({ operation: "start" })} selected />,
    );

    expect(screen.getAllByText("启动中")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "刷新受管浏览器状态" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "停止" })).toBeDisabled();
  });
});
