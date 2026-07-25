import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makeSettingsResponse } from "../test/fixtures";
import { SettingsBoard } from "./settings-board";

describe("服务配置界面", () => {
  it("校验作者映射后再提交配置", async () => {
    const onSave = vi.fn();
    render(
      <SettingsBoard
        error=""
        loading={false}
        onRefresh={vi.fn()}
        onSave={onSave}
        onSaved={vi.fn()}
        saving={false}
        settings={makeSettingsResponse()}
      />,
    );

    fireEvent.change(screen.getByLabelText("作者名称映射"), {
      target: { value: "[]" },
    });
    const saveButton = screen.getByRole("button", { name: "保存配置" });
    expect(saveButton).toHaveAttribute("type", "submit");
    fireEvent.click(saveButton);

    expect(
      await screen.findByText("作者名称映射必须是字符串键值对象"),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("允许显式清除敏感配置且不会显示原值", async () => {
    const onSaved = vi.fn();
    const onSave = vi.fn().mockResolvedValue(
      makeSettingsResponse({
        restart_required: true,
        cookie_configured: false,
      }),
    );
    render(
      <SettingsBoard
        error=""
        loading={false}
        onRefresh={vi.fn()}
        onSave={onSave}
        onSaved={onSaved}
        saving={false}
        settings={makeSettingsResponse({ cookie_configured: true })}
      />,
    );

    expect(screen.getByLabelText("小红书 Cookie")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "清除" }));
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ cookie: null }),
      ),
    );
    expect(onSaved).toHaveBeenCalledWith(
      "配置已保存；可热更新字段已生效，其余配置重启后生效",
    );
  });

  it("输入替代值时取消敏感配置清除状态", async () => {
    const onSave = vi.fn().mockResolvedValue(makeSettingsResponse());
    render(
      <SettingsBoard
        error=""
        loading={false}
        onRefresh={vi.fn()}
        onSave={onSave}
        onSaved={vi.fn()}
        saving={false}
        settings={makeSettingsResponse({ cookie_configured: true })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "清除" }));
    fireEvent.change(screen.getByLabelText("小红书 Cookie"), {
      target: { value: "session=replacement" },
    });
    expect(screen.queryByText("保存时清除")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ cookie: "session=replacement" }),
      ),
    );
  });

  it("提供加载失败与重试状态", () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <SettingsBoard
        error=""
        loading
        onRefresh={onRefresh}
        onSave={vi.fn()}
        onSaved={vi.fn()}
        saving={false}
        settings={null}
      />,
    );
    expect(screen.getByText("正在读取配置")).toBeInTheDocument();

    rerender(
      <SettingsBoard
        error="配置端点不可用"
        loading={false}
        onRefresh={onRefresh}
        onSave={vi.fn()}
        onSaved={vi.fn()}
        saving={false}
        settings={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
