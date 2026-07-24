import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MobileWorkspaceNav } from "./mobile-workspace-nav";

describe("移动端工作台导航", () => {
  it("切换到任务管理视图", () => {
    const onViewChange = vi.fn();
    render(
      <MobileWorkspaceNav onViewChange={onViewChange} view="posts" />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "任务" }));

    expect(onViewChange).toHaveBeenCalledWith("tasks");
    fireEvent.click(screen.getByRole("radio", { name: "发布" }));
    expect(onViewChange).toHaveBeenCalledWith("publication");
  });
});
