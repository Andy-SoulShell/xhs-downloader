import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrowserTaskDiagnostics } from "./browser-task-diagnostics";

const writeText = vi.fn<() => Promise<void>>();

describe("浏览器任务页面诊断", () => {
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  it("在窄内容容器中展示语义诊断并只复制安全字段", async () => {
    render(
      <div style={{ width: 280 }}>
        <BrowserTaskDiagnostics
          result={{
            adapter_version: "xhs-web-2026.07",
            selector_profile: "semantic-dom-v1",
            page_kind: "search",
            matched_anchors: ["main_container", "filter_control"],
            missing_anchors: ["feed_container"],
            raw_page: "不应显示的页面原文",
            request_url: "https://example.invalid/search?keyword=不应显示的用户文本",
            access_token: "synthetic-secret-token",
          }}
        />
      </div>,
    );

    const panel = screen.getByRole("region", { name: "安全页面诊断" });
    expect(panel).toHaveClass("min-w-0");
    expect(screen.getByText("搜索页")).toBeInTheDocument();
    expect(screen.getByText("主内容容器")).toBeInTheDocument();
    expect(screen.getByText("搜索筛选")).toBeInTheDocument();
    expect(screen.getByText("帖子列表")).toBeInTheDocument();
    expect(screen.queryByText(/页面原文/)).not.toBeInTheDocument();
    expect(screen.queryByText(/用户文本/)).not.toBeInTheDocument();
    expect(screen.queryByText(/synthetic-secret/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "复制安全页面诊断" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify(
        {
          adapter_version: "xhs-web-2026.07",
          selector_profile: "semantic-dom-v1",
          page_kind: "search",
          matched_anchors: ["main_container", "filter_control"],
          missing_anchors: ["feed_container"],
        },
        null,
        2,
      ),
    );
    expect(await screen.findByText("安全诊断已复制")).toBeInTheDocument();
  });

  it("复制失败时显示明确错误且不暴露原始结果", async () => {
    writeText.mockRejectedValueOnce(new Error("synthetic clipboard failure"));
    render(
      <BrowserTaskDiagnostics
        result={{
          adapter_version: "xhs-web-2026.07",
          token: "synthetic-secret-token",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制安全页面诊断" }));
    expect(await screen.findByText("复制失败，请稍后重试")).toBeInTheDocument();
    expect(screen.queryByText(/synthetic-secret/)).not.toBeInTheDocument();
  });

  it("无白名单诊断时不占位也不提供复制入口", () => {
    render(
      <BrowserTaskDiagnostics
        result={{
          raw_html: "<main>合成页面原文</main>",
          token: "synthetic-secret-token",
        }}
      />,
    );

    // 没有可公开诊断时整块不渲染，避免每条记录都挂一句无用提示。
    expect(screen.queryByLabelText("安全页面诊断")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制安全页面诊断" })).not.toBeInTheDocument();
    expect(screen.queryByText(/合成页面原文/)).not.toBeInTheDocument();
  });
});
