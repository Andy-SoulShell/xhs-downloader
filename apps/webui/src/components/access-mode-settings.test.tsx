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

  it("仅 HTTP 模式禁用浏览器选择但保留现有值", () => {
    const values = makeSettingsResponse().values;
    render(
      <AccessModeSettings
        onChange={vi.fn()}
        values={{
          ...values,
          route_strategy: "http_only",
          browser_driver: "managed",
        }}
      />,
    );

    expect(screen.getByLabelText("浏览器执行器")).toBeDisabled();
    expect(screen.getByLabelText("浏览器执行器")).toHaveValue("managed");
    expect(
      screen.getByText(
        "当前仅使用 HTTP；切换到含浏览器的策略后可选择执行器。",
      ),
    ).toBeInTheDocument();
  });
});
