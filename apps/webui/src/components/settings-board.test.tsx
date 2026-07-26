import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makeSettingsResponse } from "../test/fixtures";
import { SettingsBoard } from "./settings-board";

describe("服务配置界面", () => {
  it("作者映射填了一半也不会阻断其余配置保存", async () => {
    const onSave = vi.fn().mockResolvedValue(makeSettingsResponse());
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

    fireEvent.click(screen.getByRole("button", { name: "添加一条" }));
    fireEvent.change(screen.getByLabelText("作者 ID"), {
      target: { value: "synthetic-author" },
    });
    // 填了一半时就地提示，而不是等到保存时整页报错。
    expect(
      screen.getByText("有 1 条只填了一半，保存时会忽略这些行。"),
    ).toBeInTheDocument();

    const saveButton = screen.getByRole("button", { name: "保存配置" });
    expect(saveButton).toHaveAttribute("type", "submit");
    fireEvent.click(saveButton);

    // 半行被忽略，其余配置照常保存，不再整页阻断。
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ mapping_data: {} }),
      ),
    );
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
      "已保存；部分修改要重启服务才生效",
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

  it("保存受管 Chromium 路径并允许清空恢复自动检测", async () => {
    const onSave = vi.fn().mockResolvedValue(
      makeSettingsResponse({ restart_required: true }),
    );
    render(
      <SettingsBoard
        error=""
        loading={false}
        onRefresh={vi.fn()}
        onSave={onSave}
        onSaved={vi.fn()}
        saving={false}
        settings={makeSettingsResponse({
          values: {
            ...makeSettingsResponse().values,
            managed_browser_executable: "/synthetic/chromium",
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开高级选项" }));
    fireEvent.change(screen.getByLabelText("自带浏览器位置"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ managed_browser_executable: null }),
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
