import { afterEach, describe, expect, it } from "vitest";

import { readLiveInitialState } from "./browser-state-bridge";
import { installBrowserStateBridge } from "./browser-state-main";

type TestWindow = Window & { __INITIAL_STATE__?: unknown };

afterEach(() => {
  delete (window as TestWindow).__INITIAL_STATE__;
});

describe("页面实时状态桥接", () => {
  it("通过字符串事件边界返回主世界状态", async () => {
    (window as TestWindow).__INITIAL_STATE__ = {
      search: { feeds: { value: [{ id: "synthetic-feed" }] } },
    };
    const uninstall = installBrowserStateBridge(window as TestWindow);

    const state = await readLiveInitialState(document);
    uninstall();

    expect(state).toMatchObject({
      search: { feeds: { value: [{ id: "synthetic-feed" }] } },
    });
  });

  it("状态缺失或桥接未安装时返回明确错误", async () => {
    const uninstall = installBrowserStateBridge(window as TestWindow);
    await expect(readLiveInitialState(document)).rejects.toThrow(
      "实时状态尚未加载",
    );
    uninstall();

    await expect(readLiveInitialState(document, 5)).rejects.toThrow(
      "实时状态超时",
    );
  });

  it("拒绝无窗口文档，并安全移除状态中的循环引用", async () => {
    await expect(
      readLiveInitialState(document.implementation.createHTMLDocument()),
    ).rejects.toThrow("没有可用窗口");
    const cyclic: Record<string, unknown> = {
      note: { title: "合成标题" },
      dep: { shouldBeRemoved: true },
    };
    cyclic.self = cyclic;
    (window as TestWindow).__INITIAL_STATE__ = cyclic;
    const uninstall = installBrowserStateBridge(window as TestWindow);

    await expect(readLiveInitialState(document)).resolves.toEqual({
      note: { title: "合成标题" },
    });
    uninstall();
  });
});
