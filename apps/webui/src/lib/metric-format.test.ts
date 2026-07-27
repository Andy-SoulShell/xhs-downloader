import { describe, expect, it } from "vitest";

import {
  UNKNOWN_METRIC_TEXT,
  formatMetricValue,
  metricAriaLabel,
} from "./metric-format";

describe("互动数量格式化", () => {
  it("已知数量原样展示", () => {
    expect(formatMetricValue("128.6万")).toBe("128.6万");
    expect(formatMetricValue("0")).toBe("0");
  });

  it("把哨兵值和空值折叠为占位符", () => {
    // 领域模型未取到数量时默认写入 "-1"，直接展示会变成没有意义的 “♡ -1”。
    expect(formatMetricValue("-1")).toBe(UNKNOWN_METRIC_TEXT);
    expect(formatMetricValue("  -1  ")).toBe(UNKNOWN_METRIC_TEXT);
    expect(formatMetricValue("")).toBe(UNKNOWN_METRIC_TEXT);
    expect(formatMetricValue("   ")).toBe(UNKNOWN_METRIC_TEXT);
  });

  it("无障碍名称明确读出未知而不是读出哨兵值", () => {
    expect(metricAriaLabel("赞", "3721")).toBe("赞 3721");
    expect(metricAriaLabel("赞", "-1")).toBe("赞数量未知");
  });
});
