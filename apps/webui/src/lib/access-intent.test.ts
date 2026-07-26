import { describe, expect, it } from "vitest";

import { detectAccessIntent, presetForIntent } from "./access-intent";
import { makeSettingsResponse } from "../test/fixtures";

const values = makeSettingsResponse().values;

describe("连接方式推断", () => {
  it("识别扩展与自带浏览器两种预设", () => {
    expect(
      detectAccessIntent({
        ...values,
        route_strategy: "browser_only",
        browser_driver: "extension",
      }),
    ).toBe("extension");
    expect(
      detectAccessIntent({
        ...values,
        route_strategy: "browser_only",
        browser_driver: "managed",
      }),
    ).toBe("managed");
  });

  it("不属于预设的组合保留为自定义", () => {
    // 手工调整过的组合不能在展示时被改写成某个预设。
    expect(
      detectAccessIntent({
        ...values,
        route_strategy: "http_first",
        browser_driver: "managed",
      }),
    ).toBe("custom");
  });

  it("预设给出成对的路由与浏览器组合", () => {
    expect(presetForIntent("extension")).toEqual({
      route_strategy: "browser_only",
      browser_driver: "extension",
    });
    expect(presetForIntent("managed")).toEqual({
      route_strategy: "browser_only",
      browser_driver: "managed",
    });
    expect(presetForIntent("custom")).toBeNull();
  });
});
