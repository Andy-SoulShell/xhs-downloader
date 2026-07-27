import { describe, expect, it } from "vitest";

import {
  SERVICE_UNREACHABLE_MESSAGE,
  UserFacingError,
  describeError,
} from "./error-message";

describe("异常描述", () => {
  it("网络层失败换成能指导行动的中文提示", () => {
    // fetch 在服务不可达时抛出的是浏览器原生 TypeError，原文是英文，
    // 直接展示会让界面出现 “Failed to fetch”。
    expect(describeError(new TypeError("Failed to fetch"), "读取失败")).toBe(
      SERVICE_UNREACHABLE_MESSAGE,
    );
    expect(describeError(new Error("Load failed"), "读取失败")).toBe(
      SERVICE_UNREACHABLE_MESSAGE,
    );
    expect(
      describeError(
        new Error("NetworkError when attempting to fetch resource"),
        "读取失败",
      ),
    ).toBe(SERVICE_UNREACHABLE_MESSAGE);
  });

  it("后端给出的提示原样透出", () => {
    expect(
      describeError(new UserFacingError("请求失败（HTTP 500）"), "读取失败"),
    ).toBe("请求失败（HTTP 500）");
  });

  it("普通代码错误既不误判成网络故障也不原样泄漏", () => {
    // 读取空值同样抛 TypeError，按类型判网络故障会让真正的缺陷伪装成
    // “服务没开”；而它的原文又可能夹带中文属性名，按文本判也会漏出去。
    expect(
      describeError(
        new TypeError("Cannot read properties of undefined (reading '媒体')"),
        "解析失败",
      ),
    ).toBe("解析失败");
  });

  it("其余英文运行时错误一律换成兜底文案", () => {
    expect(
      describeError(new Error("Cannot read properties of null"), "读取失败"),
    ).toBe("读取失败");
    expect(describeError(new Error("   "), "读取失败")).toBe("读取失败");
    expect(describeError("不是异常对象", "读取失败")).toBe("读取失败");
    expect(describeError(undefined, "读取失败")).toBe("读取失败");
  });
});
