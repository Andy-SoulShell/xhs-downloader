import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectDesktopService,
  shutdownDesktopService,
} from "../lib/desktop-api";
import { DesktopServiceControl } from "./desktop-service-control";

vi.mock("../lib/desktop-api", () => ({
  detectDesktopService: vi.fn(),
  shutdownDesktopService: vi.fn(),
}));

describe("桌面服务控制", () => {
  beforeEach(() => {
    vi.mocked(detectDesktopService).mockResolvedValue(true);
    vi.mocked(shutdownDesktopService).mockResolvedValue(
      "本地服务正在安全退出",
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("只在桌面模式显示并允许确认退出", async () => {
    render(<DesktopServiceControl />);

    const button = await screen.findByRole("button", {
      name: "关闭本地服务",
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(shutdownDesktopService).toHaveBeenCalledOnce(),
    );
    expect(screen.getByText("本地服务正在安全退出")).toBeInTheDocument();
  });

  it("开发 API 不显示退出入口", async () => {
    vi.mocked(detectDesktopService).mockResolvedValue(false);
    render(<DesktopServiceControl />);

    await waitFor(() => expect(detectDesktopService).toHaveBeenCalled());
    expect(
      screen.queryByRole("button", { name: "关闭本地服务" }),
    ).not.toBeInTheDocument();
  });
});
