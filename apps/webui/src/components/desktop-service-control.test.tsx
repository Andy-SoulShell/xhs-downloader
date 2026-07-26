import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    vi.mocked(shutdownDesktopService).mockResolvedValue(
      "本地服务正在安全退出",
    );
    vi.mocked(restartDesktopService).mockResolvedValue("本地服务正在重启");
    vi.mocked(waitForServiceReady).mockResolvedValue(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("只在桌面模式显示并允许确认退出", async () => {
    render(<DesktopServiceControl />);

    fireEvent.click(await screen.findByRole("button", { name: "关闭服务" }));

    await waitFor(() =>
      expect(shutdownDesktopService).toHaveBeenCalledOnce(),
    );
    expect(screen.getByText("本地服务正在安全退出")).toBeInTheDocument();
  });

  it("开发 API 不显示服务控制入口", async () => {
    vi.mocked(detectDesktopService).mockResolvedValue(false);
    render(<DesktopServiceControl />);

    await waitFor(() => expect(detectDesktopService).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "关闭服务" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "重启服务" }),
    ).not.toBeInTheDocument();
  });

  it("重启后等待服务恢复并通知调用方刷新配置", async () => {
    const onRestarted = vi.fn();
    render(<DesktopServiceControl onRestarted={onRestarted} />);

    fireEvent.click(await screen.findByRole("button", { name: "重启服务" }));

    await waitFor(() => expect(restartDesktopService).toHaveBeenCalledOnce());
    expect(waitForServiceReady).toHaveBeenCalledOnce();
    expect(
      await screen.findByText("已重启，全部配置都已生效。"),
    ).toBeInTheDocument();
    expect(onRestarted).toHaveBeenCalledOnce();
  });

  it("服务未在等待时间内恢复时提示刷新且不谎报成功", async () => {
    const onRestarted = vi.fn();
    vi.mocked(waitForServiceReady).mockResolvedValue(false);
    render(<DesktopServiceControl onRestarted={onRestarted} />);

    fireEvent.click(await screen.findByRole("button", { name: "重启服务" }));

    expect(
      await screen.findByText("重启用时较长，请刷新页面确认服务状态。"),
    ).toBeInTheDocument();
    expect(onRestarted).not.toHaveBeenCalled();
  });

  it("有配置等待重启时说明原因并突出重启入口", async () => {
    render(<DesktopServiceControl restartRequired />);

    expect(
      await screen.findByText("有配置需要重启才能生效，现在就可以重启。"),
    ).toBeInTheDocument();
  });

  it("重启失败时展示原因且不触发刷新", async () => {
    const onRestarted = vi.fn();
    vi.mocked(restartDesktopService).mockRejectedValue(
      new Error("本地服务无响应"),
    );
    render(<DesktopServiceControl onRestarted={onRestarted} />);

    fireEvent.click(await screen.findByRole("button", { name: "重启服务" }));

    expect(await screen.findByText("本地服务无响应")).toBeInTheDocument();
    expect(onRestarted).not.toHaveBeenCalled();
  });
});
