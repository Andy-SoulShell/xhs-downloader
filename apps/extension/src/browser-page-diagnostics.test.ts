import { describe, expect, it } from "vitest";

import { buildPageCompatibilityDiagnostics } from "./browser-page-diagnostics";

describe("页面兼容性诊断", () => {
  it("识别状态数据版本和搜索页语义锚点", () => {
    const page = document.implementation.createHTMLDocument();
    page.body.innerHTML = `
      <script>window.__INITIAL_STATE__={}</script>
      <div class="main-container">
        <div class="filter"></div>
        <div class="feeds-container"></div>
      </div>
    `;

    const result = buildPageCompatibilityDiagnostics(
      page,
      "https://www.xiaohongshu.com/search_result?keyword=sensitive",
    );

    expect(result).toEqual({
      adapter_version: "xhs-web-2026.07",
      selector_profile: "initial-state-v1",
      page_kind: "search",
      matched_anchors: [
        "initial_state",
        "main_container",
        "filter_control",
        "feed_container",
      ],
      missing_anchors: [],
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("未知结构只报告安全的缺失锚点", () => {
    const result = buildPageCompatibilityDiagnostics(
      document.implementation.createHTMLDocument(),
      "not-a-url",
    );

    expect(result).toMatchObject({
      selector_profile: "unknown",
      page_kind: "unknown",
      matched_anchors: [],
      missing_anchors: ["initial_state", "main_container"],
    });
  });
});
