import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makeSettingsResponse } from "../test/fixtures";
import { AccessModeSettings } from "./access-mode-settings";

describe("访问模式配置", () => {
  it("分别修改路由策略和浏览器执行器", () => {
    const onChange = vi.fn();
    render(
      <AccessModeSettings
        onChange={onChange}
        values={makeSettingsResponse().values}
      />,
    );

    fireEvent.change(screen.getByLabelText("只读路由策略"), {
      target: { value: "http_first" },
    });
    fireEvent.change(screen.getByLabelText("浏览器执行器"), {
      target: { value: "managed" },
    });

    expect(onChange).toHaveBeenNthCalledWith(
      1,
      "route_strategy",
      "http_first",
    );
    expect(onChange).toHaveBeenNthCalledWith(
      2,
      "browser_driver",
      "managed",
    );
  });

  it("可指定受管 Chromium 路径并通过清空恢复自动检测", () => {
    const onChange = vi.fn();
    render(
      <AccessModeSettings
        onChange={onChange}
        values={{
          ...makeSettingsResponse().values,
          managed_browser_executable: "/synthetic/chromium",
        }}
      />,
    );

    const executable = screen.getByLabelText("受管 Chromium 可执行文件");
    expect(executable).toHaveValue("/synthetic/chromium");
    fireEvent.change(executable, {
      target: { value: "/synthetic/updated-chromium" },
    });
    fireEvent.change(executable, { target: { value: "" } });

    expect(onChange).toHaveBeenNthCalledWith(
      1,
      "managed_browser_executable",
      "/synthetic/updated-chromium",
    );
    expect(onChange).toHaveBeenNthCalledWith(
      2,
      "managed_browser_executable",
      null,
    );
    expect(
      screen.getByText(
        "可选；请填写 Chrome 或 Chromium 的完整可执行文件路径。清空后恢复自动检测，保存后重启本地服务生效。",
      ),
    ).toBeInTheDocument();
  });

  it("仅 HTTP 读取时仍允许选择写操作浏览器执行器", () => {
    const values = makeSettingsResponse().values;
    const onChange = vi.fn();
    render(
      <AccessModeSettings
        onChange={onChange}
        values={{
          ...values,
          route_strategy: "http_only",
          browser_driver: "managed",
        }}
      />,
    );

    const browser = screen.getByLabelText("浏览器执行器");
    expect(browser).toBeEnabled();
    expect(browser).toHaveValue("managed");
    fireEvent.change(browser, { target: { value: "extension" } });
    expect(onChange).toHaveBeenCalledWith("browser_driver", "extension");
    expect(
      screen.getByText(
        "该选择同时用于浏览器读取和写操作；即使只读策略为仅 HTTP，互动与发布仍使用这里选定的执行器。",
      ),
    ).toBeInTheDocument();
  });
});
