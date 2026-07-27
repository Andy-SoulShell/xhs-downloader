import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserTask, LoginQrCodeResult } from "../lib/types";
import { deleteCookies, executeBrowserOperation } from "../lib/browser-api";
import { listBrowserExtensions, listBrowserTasks } from "../lib/browser-management-api";
import { useManagedBrowser } from "../lib/use-managed-browser";
import { makeManagedBrowserControl, makeManagedBrowserStatus } from "../test/managed-browser";
import { BrowserBoard } from "./browser-board";

vi.mock("../lib/browser-api", () => ({
  deleteCookies: vi.fn(),
  executeBrowserOperation: vi.fn(),
  executeReadCapability: vi.fn(),
}));
vi.mock("../lib/browser-management-api", () => ({
  listBrowserExtensions: vi.fn(),
  listBrowserTasks: vi.fn(),
  retryBrowserTask: vi.fn(),
}));
vi.mock("../lib/use-managed-browser", () => ({
  useManagedBrowser: vi.fn(),
}));

const qrCode: LoginQrCodeResult = {
  is_logged_in: false,
  image_data_url: "data:image/png;base64,c3ludGhldGljLXFy",
  expires_at: "2026-01-01T00:04:00Z",
  consumed: false,
};

const qrTask: BrowserTask = {
  task_id: "synthetic-qr-task",
  request_id: "synthetic-request",
  kind: "get_login_qrcode",
  payload: {},
  status: "succeeded",
  result: { ...qrCode },
  target_driver: "extension",
  executor_id: "synthetic-extension",
  extension_id: "synthetic-extension",
  lease_expires_at: null,
  attempts: 1,
  message: "登录二维码已生成",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("浏览器登录与会话操作", () => {
  beforeEach(() => {
    vi.mocked(useManagedBrowser).mockReturnValue(makeManagedBrowserControl());
    vi.mocked(listBrowserExtensions).mockResolvedValue([]);
    vi.mocked(listBrowserTasks).mockResolvedValue([]);
    vi.mocked(executeBrowserOperation).mockResolvedValue({
      task: qrTask,
      data: qrCode,
    });
    vi.mocked(deleteCookies).mockResolvedValue({
      target: "browser",
      status: "succeeded",
      deleted: true,
      message: "浏览器中的小红书 Cookie 已清除",
      task_id: "synthetic-delete-task",
      restart_required: false,
    });
  });

  it("展示一次性二维码并二次确认 Cookie 清理", async () => {
    render(<BrowserBoard browserDriver="extension" />);

    fireEvent.click(screen.getByRole("button", { name: "获取登录二维码" }));
    expect(await screen.findByRole("img", { name: "小红书登录二维码" })).toHaveAttribute(
      "src",
      qrCode.image_data_url,
    );
    expect(executeBrowserOperation).toHaveBeenCalledWith(
      "/xhs/login/qrcode",
      {},
      expect.any(AbortSignal),
    );

    fireEvent.click(screen.getByRole("button", { name: "清除浏览器 Cookie" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("确认清除浏览器中的小红书 Cookie");
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(deleteCookies).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "清除浏览器 Cookie" }));
    fireEvent.click(screen.getByRole("button", { name: "确认清除" }));
    await waitFor(() =>
      expect(deleteCookies).toHaveBeenCalledWith("browser", expect.any(AbortSignal)),
    );
    expect(await screen.findByText("浏览器中的小红书 Cookie 已清除")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("浏览器已登录时不再展示二维码", async () => {
    const loggedIn = {
      is_logged_in: true,
      image_data_url: null,
      expires_at: null,
      consumed: false,
    };
    vi.mocked(executeBrowserOperation).mockResolvedValueOnce({
      task: { ...qrTask, result: { ...loggedIn } },
      data: loggedIn,
    });
    render(<BrowserBoard browserDriver="extension" />);

    fireEvent.click(screen.getByRole("button", { name: "获取登录二维码" }));

    expect(await screen.findByText("浏览器已经登录，无需扫码")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "小红书登录二维码" })).not.toBeInTheDocument();
  });

  it("为未知过期时间提供回退提示", async () => {
    const withoutExpiry = { ...qrCode, expires_at: null };
    vi.mocked(executeBrowserOperation).mockResolvedValueOnce({
      task: { ...qrTask, result: { ...withoutExpiry } },
      data: withoutExpiry,
    });
    render(<BrowserBoard browserDriver="extension" />);

    fireEvent.click(screen.getByRole("button", { name: "获取登录二维码" }));

    const image = await screen.findByRole("img", {
      name: "小红书登录二维码",
    });
    expect(image.parentElement).toHaveTextContent("短时间内");
  });

  it("展示 Cookie 清理错误并保留确认入口", async () => {
    vi.mocked(deleteCookies).mockRejectedValueOnce(new Error("站点数据清理失败"));
    render(<BrowserBoard browserDriver="extension" />);

    fireEvent.click(screen.getByRole("button", { name: "清除浏览器 Cookie" }));
    fireEvent.click(screen.getByRole("button", { name: "确认清除" }));

    expect(await screen.findByText(/站点数据清理失败/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除浏览器 Cookie" })).toBeEnabled();
  });

  it.each([
    ["extension", makeManagedBrowserStatus(), "登录会在浏览器扩展连接的真实小红书页面完成", false],
    [
      "managed",
      makeManagedBrowserStatus({ state: "running", cdp_port: 9222 }),
      "登录会在已启动的受管浏览器中完成",
      false,
    ],
    ["managed", makeManagedBrowserStatus({ state: "stopped" }), "受管浏览器还没启动", true],
  ] as const)("根据 %s 执行器展示首次登录引导", (browserDriver, status, guidance, disabled) => {
    vi.mocked(useManagedBrowser).mockReturnValue(makeManagedBrowserControl({ status }));
    render(<BrowserBoard browserDriver={browserDriver} />);

    expect(screen.getByText(new RegExp(guidance))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "获取登录二维码" })).toHaveProperty(
      "disabled",
      disabled,
    );
  });
  it("后台运行时挡住二维码这条路并给出绕行办法", () => {
    vi.mocked(useManagedBrowser).mockReturnValue(
      makeManagedBrowserControl({
        status: makeManagedBrowserStatus({ state: "running", cdp_port: 9222 }),
      }),
    );
    render(<BrowserBoard browserDriver="managed" headless />);

    // 实测无头 Chrome 下小红书不渲染登录二维码，任务只会失败；
    // 不能让人点了等一场空，这里直接挡住并说清怎么绕过去。
    expect(screen.getByRole("button", { name: "获取登录二维码" })).toBeDisabled();
    expect(screen.getByText(/关掉「不显示浏览器窗口」/)).toBeInTheDocument();
    // 检查登录在无头下是能用的，不该跟着一起禁用。
    expect(screen.getByRole("button", { name: "检查登录" })).toBeEnabled();
  });
});
