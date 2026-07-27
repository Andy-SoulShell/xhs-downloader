import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectDesktopService,
  restartDesktopService,
  shutdownDesktopService,
  waitForServiceReady,
} from "../lib/desktop-api";
import { DesktopServiceControl } from "./desktop-service-control";

vi.mock("../lib/desktop-api", () => ({
  detectDesktopService: vi.fn(),
  restartDesktopService: vi.fn(),
  shutdownDesktopService: vi.fn(),
  waitForServiceReady: vi.fn(),
}));

describe("桌面服务控制", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(detectDesktopService).mockResolvedValue(true);
    vi.mocked(shutdownDesktopService).mockResolvedValue("本地服务正在安全退出");
    vi.mocked(restartDesktopService).mockResolvedValue("本地服务正在重启");
    vi.mocked(waitForServiceReady).mockResolvedValue(true);
  });

  it("关闭服务前就地确认并说明后果", async () => {
    render(<DesktopServiceControl />);

    fireEvent.click(await screen.findByRole("button", { name: "关闭服务" }));

    // 换成 Radix AlertDialog：可访问名来自标题，焦点被困在框内、Esc 可关。
    const dialog = await screen.findByRole("alertdialog", {
      name: "确认关闭本地服务吗？",
    });
    expect(dialog).toHaveTextContent("正在进行的下载会中断");
    expect(shutdownDesktopService).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "确认关闭" }));
    await waitFor(() => expect(shutdownDesktopService).toHaveBeenCalledOnce());
    expect(screen.getByText("本地服务正在安全退出")).toBeInTheDocument();
  });

  it("取消确认后不执行关闭", async () => {
    render(<DesktopServiceControl />);

    fireEvent.click(await screen.findByRole("button", { name: "关闭服务" }));
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("alertdialog", { name: "确认关闭本地服务" })).not.toBeInTheDocument();
    expect(shutdownDesktopService).not.toHaveBeenCalled();
  });

  it("开发 API 不显示服务控制入口", async () => {
    vi.mocked(detectDesktopService).mockResolvedValue(false);
    render(<DesktopServiceControl />);

    await waitFor(() => expect(detectDesktopService).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "关闭服务" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重启服务" })).not.toBeInTheDocument();
  });

  it("重启后等待服务恢复并通知调用方刷新配置", async () => {
    const onRestarted = vi.fn();
    render(<DesktopServiceControl onRestarted={onRestarted} />);

    fireEvent.click(await screen.findByRole("button", { name: "重启服务" }));

    await waitFor(() => expect(restartDesktopService).toHaveBeenCalledOnce());
    expect(waitForServiceReady).toHaveBeenCalledOnce();
    expect(await screen.findByText("已重启，全部配置都已生效。")).toBeInTheDocument();
    expect(onRestarted).toHaveBeenCalledOnce();
  });

  it("服务未在等待时间内恢复时提示刷新且不谎报成功", async () => {
    const onRestarted = vi.fn();
    vi.mocked(waitForServiceReady).mockResolvedValue(false);
    render(<DesktopServiceControl onRestarted={onRestarted} />);

    fireEvent.click(await screen.findByRole("button", { name: "重启服务" }));

    expect(await screen.findByText("重启用时较长，请刷新页面确认服务状态。")).toBeInTheDocument();
    expect(onRestarted).not.toHaveBeenCalled();
  });

  it("有配置等待重启时说明原因并突出重启入口", async () => {
    render(<DesktopServiceControl restartRequired />);

    expect(await screen.findByText("有配置需要重启才能生效，现在就可以重启。")).toBeInTheDocument();
  });

  it("重启失败时展示原因且不触发刷新", async () => {
    const onRestarted = vi.fn();
    vi.mocked(restartDesktopService).mockRejectedValue(new Error("本地服务无响应"));
    render(<DesktopServiceControl onRestarted={onRestarted} />);

    fireEvent.click(await screen.findByRole("button", { name: "重启服务" }));

    expect(await screen.findByText("本地服务无响应")).toBeInTheDocument();
    expect(onRestarted).not.toHaveBeenCalled();
  });
});
