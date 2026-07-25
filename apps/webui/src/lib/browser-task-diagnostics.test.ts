import { describe, expect, it } from "vitest";

import {
  safeBrowserTaskDiagnostics,
  serializeSafeBrowserTaskDiagnostics,
} from "./browser-task-diagnostics";

describe("浏览器任务安全诊断", () => {
  it("只保留页面适配器生成的白名单字段和值", () => {
    const diagnostics = safeBrowserTaskDiagnostics({
      adapter_version: "xhs-web-2026.07",
      selector_profile: "semantic-dom-v1",
      page_kind: "feed_detail",
      matched_anchors: [
        "main_container",
        "detail_container",
        "main_container",
        "用户输入",
      ],
      missing_anchors: ["comment_container", "access_token"],
      raw_html: "<main>不应公开的页面原文</main>",
      request_url:
        "https://www.xiaohongshu.com/explore/synthetic?token=secret",
      token: "synthetic-secret-token",
      user_text: "不应公开的用户正文",
    });

    expect(diagnostics).toEqual({
      adapter_version: "xhs-web-2026.07",
      selector_profile: "semantic-dom-v1",
      page_kind: "feed_detail",
      matched_anchors: ["main_container", "detail_container"],
      missing_anchors: ["comment_container"],
    });
    const serialized = serializeSafeBrowserTaskDiagnostics(diagnostics!);
    expect(serialized).not.toContain("页面原文");
    expect(serialized).not.toContain("request_url");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("用户正文");
  });

  it("拒绝伪装成诊断字段的 URL、令牌和未知枚举值", () => {
    expect(
      safeBrowserTaskDiagnostics({
        adapter_version:
          "https://example.invalid/page?access_token=synthetic",
        selector_profile: "synthetic-secret-token",
        page_kind: "用户输入的页面名称",
        matched_anchors: ["authorization"],
        missing_anchors: ["raw_page"],
      }),
    ).toBeNull();
    expect(
      safeBrowserTaskDiagnostics({
        adapter_version: "xhs-web-synthetic-secret",
      }),
    ).toBeNull();
  });

  it("限制检查和展示的锚点数量", () => {
    const diagnostics = safeBrowserTaskDiagnostics({
      page_kind: "home",
      matched_anchors: [
        "initial_state",
        "main_container",
        "feed_container",
        "filter_control",
        "comment_container",
        "detail_container",
        "profile_container",
        "main_container",
        ...Array.from({ length: 8 }, () => "unknown_anchor"),
        "initial_state",
      ],
    });

    expect(diagnostics?.matched_anchors).toEqual([
      "initial_state",
      "main_container",
      "feed_container",
      "filter_control",
      "comment_container",
      "detail_container",
      "profile_container",
    ]);
  });

  it("空结果和业务结果不会产生页面诊断", () => {
    expect(safeBrowserTaskDiagnostics(null)).toBeNull();
    expect(
      safeBrowserTaskDiagnostics({
        feeds: [{ title: "合成帖子标题" }],
        xsec_token: "synthetic-token",
      }),
    ).toBeNull();
  });
});
