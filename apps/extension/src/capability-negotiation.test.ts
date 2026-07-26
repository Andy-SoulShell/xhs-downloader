import { EXTENSION_PROTOCOL_VERSION } from "@xhs-downloader/contracts";
import { describe, expect, it } from "vitest";

import { supportsCapability } from "./capability-negotiation";

describe("扩展与服务能力协商", () => {
  it("要求服务协议达到该能力的最低版本", () => {
    const payload = {
      protocol_version: 3,
      features: { publication: true },
    };

    expect(supportsCapability(payload, 2, "publication")).toBe(true);
    expect(supportsCapability(payload, 4, "publication")).toBe(false);
  });

  it("要求对应特性开关明确开启", () => {
    const payload = {
      protocol_version: EXTENSION_PROTOCOL_VERSION,
      features: { publication: false },
    };

    expect(supportsCapability(payload, 2, "publication")).toBe(false);
    expect(supportsCapability(payload, 2, "browser_tasks")).toBe(false);
    expect(supportsCapability(payload, 2)).toBe(true);
  });

  it("拒绝要求更高扩展协议的服务", () => {
    const payload = {
      protocol_version: EXTENSION_PROTOCOL_VERSION + 1,
      minimum_extension_protocol: EXTENSION_PROTOCOL_VERSION + 1,
      features: { browser_tasks: true },
    };

    expect(supportsCapability(payload, 1)).toBe(false);
    expect(supportsCapability(payload, 4, "browser_tasks")).toBe(false);
  });

  it("接受要求不高于当前扩展协议的服务", () => {
    const payload = {
      protocol_version: EXTENSION_PROTOCOL_VERSION,
      minimum_extension_protocol: EXTENSION_PROTOCOL_VERSION,
      features: { browser_tasks: true },
    };

    expect(supportsCapability(payload, 4, "browser_tasks")).toBe(true);
  });

  it("兼容不声明最低扩展协议的旧服务", () => {
    const payload = { protocol_version: 2, features: { publication: true } };

    expect(supportsCapability(payload, 2, "publication")).toBe(true);
  });

  it("拒绝缺少协议版本的响应", () => {
    expect(supportsCapability({}, 1)).toBe(false);
    expect(supportsCapability({ features: { publication: true } }, 1)).toBe(
      false,
    );
  });
});
