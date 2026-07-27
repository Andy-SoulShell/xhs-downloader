import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { extensionGuideMode } from "../lib/extension-install-guide";
import { ExtensionInstallGuide } from "./extension-install-guide";

describe("浏览器扩展安装引导", () => {
  const writeText = vi.fn<() => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset();
    writeText.mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it.each([
    [null, 0, "hidden"],
    ["managed", 0, "hidden"],
    ["extension", 0, "install"],
    ["extension", 2, "connected"],
  ] as const)("根据连接方式和在线数量计算 %s/%s 状态", (driver, count, mode) => {
    expect(extensionGuideMode(driver, count)).toBe(mode);
  });

  it("离线时展示完整步骤、隐私边界和刷新入口", async () => {
    const onRefresh = vi.fn<() => Promise<void>>().mockResolvedValue();
    render(
      <ExtensionInstallGuide
        browserDriver="extension"
        onlineCount={0}
        onRefresh={onRefresh}
        refreshing={false}
      />,
    );

    expect(screen.getByText("加载浏览器扩展")).toBeInTheDocument();
    expect(screen.getByText(/解压发行目录中的扩展 ZIP/)).toBeInTheDocument();
    expect(screen.getByText(/开启“开发者模式”/)).toBeInTheDocument();
    expect(screen.getByText(/加载已解压的扩展程序/)).toBeInTheDocument();
    expect(screen.getByText(/不会读取或上传浏览器 Cookie/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "复制 Chrome 扩展管理地址" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("chrome://extensions"));
    expect(screen.getByText("已复制 Chrome 扩展管理地址")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "已加载，刷新状态" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("复制不可用时保留可手动复制的地址", async () => {
    writeText.mockRejectedValueOnce(new Error("synthetic clipboard failure"));
    render(
      <ExtensionInstallGuide
        browserDriver="extension"
        onlineCount={0}
        onRefresh={vi.fn()}
        refreshing={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制 Edge 扩展管理地址" }));

    expect(await screen.findByText("复制失败，请手动选择并复制上方地址")).toBeInTheDocument();
    expect(screen.getByText("edge://extensions")).toBeInTheDocument();
  });

  it("在线时收起步骤并显示成功摘要", () => {
    render(
      <ExtensionInstallGuide
        browserDriver="extension"
        onlineCount={2}
        onRefresh={vi.fn()}
        refreshing={false}
      />,
    );

    expect(screen.getByText("浏览器扩展已连接")).toBeInTheDocument();
    expect(screen.getByText("2 个实例在线")).toBeInTheDocument();
    expect(screen.queryByText("加载浏览器扩展")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /复制 Chrome/ })).not.toBeInTheDocument();
  });
});
