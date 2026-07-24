import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makeSettingsResponse } from "../test/fixtures";
import { PublicationSettings } from "./publication-settings";

describe("内容发布配置", () => {
  it("复用数值配置组件更新素材上限与租约", () => {
    const onChange = vi.fn();
    render(
      <PublicationSettings
        onChange={onChange}
        values={makeSettingsResponse().values}
      />,
    );

    fireEvent.change(screen.getByLabelText("单个发布素材上限（字节）"), {
      target: { value: "2097152" },
    });
    fireEvent.change(screen.getByLabelText("发布任务租约（秒）"), {
      target: { value: "600" },
    });

    expect(onChange).toHaveBeenCalledWith(
      "publish_max_asset_size",
      2097152,
    );
    expect(onChange).toHaveBeenCalledWith("publish_lease_seconds", 600);
  });
});
