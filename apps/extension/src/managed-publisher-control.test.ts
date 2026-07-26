import { afterEach, describe, expect, it } from "vitest";

import { prepareManagedPublishControl } from "./managed-publisher-control";

const BRIDGE = Symbol.for("xhs-downloader.publisher-control");
const FAILURE = { ok: false, message: "创作平台发布按钮未能准备" };

type BridgeScope = Record<symbol, unknown>;

function installBridge(handler: unknown): void {
  (globalThis as BridgeScope)[BRIDGE] = handler;
}

afterEach(() => {
  delete (globalThis as BridgeScope)[BRIDGE];
});

describe("受管发布按钮准备", () => {
  it("桥接确认按钮就绪时返回成功", () => {
    installBridge((action: string) =>
      action === "prepare"
        ? { ok: true, message: "创作平台发布按钮已准备" }
        : { ok: false, message: "非预期动作" },
    );

    expect(prepareManagedPublishControl()).toEqual({
      ok: true,
      message: "创作平台发布按钮已准备",
    });
  });

  it("页面尚未安装桥接时返回固定失败", () => {
    expect(prepareManagedPublishControl()).toEqual(FAILURE);
  });

  it("桥接报告未就绪时返回固定失败", () => {
    installBridge(() => ({ ok: false, message: "创作平台发布控件不可用" }));

    expect(prepareManagedPublishControl()).toEqual(FAILURE);
  });

  it("桥接返回意外文案时不认可为已准备", () => {
    // 文案不符说明桥接版本或页面结构已变化，不能据此继续发布。
    installBridge(() => ({ ok: true, message: "已聚焦创作平台发布按钮" }));

    expect(prepareManagedPublishControl()).toEqual(FAILURE);
  });

  it("桥接抛出异常时收敛为固定失败且不泄露页面内容", () => {
    installBridge(() => {
      throw new Error("页面内部错误: 包含帖子正文");
    });

    expect(prepareManagedPublishControl()).toEqual(FAILURE);
  });

  it("桥接返回空值时返回固定失败", () => {
    installBridge(() => undefined);

    expect(prepareManagedPublishControl()).toEqual(FAILURE);
  });
});
