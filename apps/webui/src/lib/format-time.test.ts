import { describe, expect, it } from "vitest";

import { formatFullTime, formatRelativeTime } from "./format-time";

const NOW = new Date("2026-07-26T20:00:00+08:00");

function ago(milliseconds: number): string {
  return new Date(NOW.getTime() - milliseconds).toISOString();
}

describe("相对时间", () => {
  it("一分钟内显示刚刚", () => {
    expect(formatRelativeTime(ago(20_000), NOW)).toBe("刚刚");
  });

  it("一小时内按分钟计", () => {
    expect(formatRelativeTime(ago(12 * 60_000), NOW)).toBe("12 分钟前");
  });

  it("当天内按小时计", () => {
    expect(formatRelativeTime(ago(3 * 3_600_000), NOW)).toBe("3 小时前");
  });

  it("跨到昨天时给出昨天与时刻", () => {
    // 距今 20 小时，已越过零点，用"小时前"会让人误以为还是今天。
    const result = formatRelativeTime(ago(20 * 3_600_000), NOW);

    expect(result.startsWith("昨天 ")).toBe(true);
  });

  it("一周内按天计", () => {
    expect(formatRelativeTime(ago(3 * 86_400_000), NOW)).toBe("3 天前");
  });

  it("超过一周回到日期", () => {
    // 相对时间到这个尺度已经失去意义。
    expect(formatRelativeTime(ago(20 * 86_400_000), NOW)).toContain("月");
  });

  it("时间在未来时退回时刻而不是负数", () => {
    const result = formatRelativeTime(new Date(NOW.getTime() + 60_000).toISOString(), NOW);

    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("无法解析的值返回空串而不是 Invalid Date", () => {
    expect(formatRelativeTime("not-a-date", NOW)).toBe("");
    expect(formatFullTime("not-a-date")).toBe("");
  });

  it("完整时间包含日期与时刻", () => {
    const result = formatFullTime("2026-07-26T12:34:00Z");

    expect(result).toContain("2026");
    expect(result).toMatch(/\d{2}:\d{2}/);
  });
});
