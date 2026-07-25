import { describe, expect, it } from "vitest";

import { capabilityRouteSource } from "./browser-route";

describe("浏览能力来源文案", () => {
  it.each([
    ["http", null, "Cookie HTTP"],
    ["browser", "managed", "受管浏览器"],
    ["browser", "extension", "浏览器扩展"],
    ["browser", null, "浏览器"],
  ] as const)("将 %s/%s 显示为 %s", (provider, browser_driver, expected) => {
    expect(capabilityRouteSource({ provider, browser_driver })).toBe(expected);
  });
});
