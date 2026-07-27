import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makeSettingsResponse } from "../test/fixtures";
import { AccessModeSettings } from "./access-mode-settings";

const values = makeSettingsResponse().values;

describe("连接方式配置", () => {
  it("选择使用方式即写入对应的路由与浏览器组合", () => {
    const onChange = vi.fn();
    render(
      <AccessModeSettings
        onChange={onChange}
        values={{ ...values, browser_driver: "extension" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /用程序自带的浏览器/ }));

    expect(onChange).toHaveBeenCalledWith("route_strategy", "browser_only");
    expect(onChange).toHaveBeenCalledWith("browser_driver", "managed");
  });

  it("高级选项默认收起，展开后可直接调整术语选项", () => {
    const onChange = vi.fn();
    render(
      <AccessModeSettings
        onChange={onChange}
        values={{ ...values, browser_driver: "extension" }}
      />,
    );

    expect(screen.queryByLabelText("读取方式")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "展开高级选项" }));
    fireEvent.change(screen.getByLabelText("读取方式"), {
      target: { value: "http_first" },
    });

    expect(onChange).toHaveBeenCalledWith("route_strategy", "http_first");
  });

  it("自定义组合会说明原因并默认展开高级选项", () => {
    render(
      <AccessModeSettings
        onChange={vi.fn()}
        values={{
          ...values,
          route_strategy: "http_first",
          browser_driver: "managed",
        }}
      />,
    );

    expect(
      screen.getByText("当前使用的是自定义组合，可以在下面的高级选项里查看和调整。"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("读取方式")).toHaveValue("http_first");
  });

  it("使用扩展时停用自带浏览器位置并说明原因", () => {
    render(
      <AccessModeSettings
        onChange={vi.fn()}
        values={{
          ...values,
          route_strategy: "http_first",
          browser_driver: "extension",
        }}
      />,
    );

    expect(screen.getByLabelText("自带浏览器位置")).toBeDisabled();
    expect(screen.getByText("当前使用浏览器扩展，不需要这一项。")).toBeInTheDocument();
  });

  it("使用自带浏览器时可填写位置并清空恢复自动检测", () => {
    const onChange = vi.fn();
    render(
      <AccessModeSettings
        onChange={onChange}
        values={{
          ...values,
          route_strategy: "http_first",
          browser_driver: "managed",
          managed_browser_executable: "/synthetic/chromium",
        }}
      />,
    );

    const executable = screen.getByLabelText("自带浏览器位置");
    expect(executable).toBeEnabled();
    expect(executable).toHaveValue("/synthetic/chromium");
    fireEvent.change(executable, { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith("managed_browser_executable", null);
  });

  it("两种隐藏窗口的方式各自可切换", () => {
    const onChange = vi.fn();
    render(
      <AccessModeSettings onChange={onChange} values={{ ...values, browser_driver: "managed" }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开高级选项" }));
    fireEvent.click(screen.getByRole("switch", { name: "不显示浏览器窗口" }));
    expect(onChange).toHaveBeenCalledWith("managed_browser_headless", true);

    fireEvent.click(screen.getByRole("switch", { name: "窗口移到屏幕外" }));
    expect(onChange).toHaveBeenCalledWith("managed_browser_offscreen", true);
  });

  it("选了不显示窗口之后，移出屏幕这一项作废", () => {
    render(
      <AccessModeSettings
        onChange={vi.fn()}
        values={{
          ...values,
          browser_driver: "managed",
          managed_browser_headless: true,
          managed_browser_offscreen: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开高级选项" }));
    // 无头时窗口根本不存在，这一项即使配置为真也不该显示成生效。
    expect(screen.getByRole("switch", { name: "窗口移到屏幕外" })).toHaveAttribute(
      "data-state",
      "unchecked",
    );
    expect(screen.getByText("上面已经选了不显示窗口，这一项用不上。")).toBeInTheDocument();
  });
});
