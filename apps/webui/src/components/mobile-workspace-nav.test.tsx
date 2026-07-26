import { fireEvent, render, screen } from "@testing-library/react";
import { Tabs } from "radix-ui";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MobileWorkspaceNav } from "./mobile-workspace-nav";

/** 与主应用一致的受控用法：值随选择变化，内容随之切换。 */
function Harness({ onValueChange }: { onValueChange: (v: string) => void }) {
  const [view, setView] = useState("content");
  return (
    <Tabs.Root
      onValueChange={(next) => {
        setView(next);
        onValueChange(next);
      }}
      value={view}
    >
      <MobileWorkspaceNav />
      <Tabs.Content value="content">内容工作台</Tabs.Content>
      <Tabs.Content value="activity">动态工作台</Tabs.Content>
      <Tabs.Content value="publication">发布工作台</Tabs.Content>
      <Tabs.Content value="settings">设置工作台</Tabs.Content>
    </Tabs.Root>
  );
}

function renderNav(onValueChange = vi.fn()) {
  render(<Harness onValueChange={onValueChange} />);
  return onValueChange;
}

describe("移动端工作台导航", () => {
  it("以标签语义呈现四个工作台并标出当前项", () => {
    renderNav();

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "内容",
      "动态",
      "发布",
      "设置",
    ]);
    expect(screen.getByRole("tab", { name: "内容" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("点击标签切换工作台", () => {
    const onValueChange = renderNav();

    // Radix Tabs 在按下时激活，与原生标签控件的行为一致。
    fireEvent.mouseDown(screen.getByRole("tab", { name: "动态" }));
    expect(onValueChange).toHaveBeenCalledWith("activity");

    fireEvent.mouseDown(screen.getByRole("tab", { name: "发布" }));
    expect(onValueChange).toHaveBeenCalledWith("publication");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("发布工作台");
  });

  it("标签与内容面板通过无障碍属性关联", () => {
    renderNav();

    const active = screen.getByRole("tab", { name: "内容" });
    const panel = screen.getByRole("tabpanel");

    expect(active).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", active.id);
  });
});
