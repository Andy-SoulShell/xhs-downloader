import { fireEvent, render, screen, within } from "@testing-library/react";
import { Tabs } from "radix-ui";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Filter, WorkspaceView } from "../lib/workspace";
import { WorkspaceSidebar } from "./workspace-sidebar";

function Harness({
  onFilterChange = vi.fn(),
  onViewChange = vi.fn(),
  online = true,
}: {
  onFilterChange?: (filter: Filter) => void;
  onViewChange?: (view: WorkspaceView) => void;
  online?: boolean | null;
}) {
  const [view, setView] = useState<WorkspaceView>("content");
  const [filter, setFilter] = useState<Filter>("all");
  return (
    <Tabs.Root
      onValueChange={(next) => {
        setView(next as WorkspaceView);
        onViewChange(next as WorkspaceView);
      }}
      value={view}
    >
      <WorkspaceSidebar
        activityCount={3}
        completedCount={2}
        filter={filter}
        onFilterChange={(next) => {
          setFilter(next);
          onFilterChange(next);
        }}
        onViewChange={(next) => {
          setView(next);
          onViewChange(next);
        }}
        online={online}
        postCount={5}
        view={view}
      />
      <Tabs.Content value="content">内容工作台</Tabs.Content>
      <Tabs.Content value="activity">动态工作台</Tabs.Content>
    </Tabs.Root>
  );
}

describe("宽屏工作台侧栏", () => {
  it("工作台以标签语义呈现并标出当前项", () => {
    render(<Harness />);
    const list = screen.getByRole("tablist", { name: "工作台" });

    expect(
      within(list)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["动态3", "发布", "设置"]);
  });

  it("点击标签切换工作台", () => {
    const onViewChange = vi.fn();
    render(<Harness onViewChange={onViewChange} />);

    fireEvent.mouseDown(
      within(screen.getByRole("tablist", { name: "工作台" })).getByRole(
        "tab",
        { name: /动态/ },
      ),
    );

    expect(onViewChange).toHaveBeenCalledWith("activity");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("动态工作台");
  });

  it("帖子筛选按未下载与已下载给出计数", () => {
    const onFilterChange = vi.fn();
    render(<Harness onFilterChange={onFilterChange} />);
    const nav = screen.getByRole("navigation", { name: "我的帖子" });

    fireEvent.click(within(nav).getByRole("button", { name: /未下载/ }));

    expect(onFilterChange).toHaveBeenCalledWith("ready");
    // 5 个帖子中 2 个已下载，未下载应为 3。
    expect(within(nav).getByRole("button", { name: /未下载/ })).toHaveTextContent(
      "3",
    );
    expect(within(nav).getByRole("button", { name: /已下载/ })).toHaveTextContent(
      "2",
    );
  });

  it("离线时提示本地服务状态", () => {
    render(<Harness online={false} />);

    expect(screen.getByText("本地服务")).toBeInTheDocument();
  });
});
