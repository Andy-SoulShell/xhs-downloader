import { afterEach, describe, expect, it, vi } from "vitest";

import { UncertainBrowserActionError } from "./browser-action-errors";
import { installBrowserStateBridge } from "./browser-state-main";
import { setDesiredInteraction } from "./interaction-runner";

type TestWindow = Window & { __INITIAL_STATE__?: unknown };

function state(liked: boolean, collected = false) {
  return {
    note: {
      noteDetailMap: {
        "synthetic-feed": {
          note: {
            noteId: "synthetic-feed",
            interactInfo: { liked, collected },
          },
        },
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  delete (window as TestWindow).__INITIAL_STATE__;
});

describe("点赞与收藏目标状态执行器", () => {
  it("状态已满足时不点击并返回可核验结果", async () => {
    const scope = window as TestWindow;
    scope.__INITIAL_STATE__ = state(true);
    const uninstall = installBrowserStateBridge(scope);

    const result = await setDesiredInteraction(document, "synthetic-feed", "like", true);
    uninstall();

    expect(result).toEqual({
      feed_id: "synthetic-feed",
      kind: "like",
      active: true,
      changed: false,
      verified: true,
    });
  });

  it("点击后轮询实时状态并确认收藏成功", async () => {
    document.body.innerHTML = `
      <div class="interact-container">
        <div class="left"><svg class="reds-icon collect-icon"></svg></div>
      </div>
    `;
    const scope = window as TestWindow;
    scope.__INITIAL_STATE__ = state(false, false);
    document.querySelector(".collect-icon")?.addEventListener("click", () => {
      scope.__INITIAL_STATE__ = state(false, true);
    });
    const uninstall = installBrowserStateBridge(scope);

    const result = await setDesiredInteraction(document, "synthetic-feed", "favorite", true);
    uninstall();

    expect(result.changed).toBe(true);
    expect(result.verified).toBe(true);
  });

  it("优先使用浏览器级可信输入并核验状态", async () => {
    document.body.innerHTML = `
      <div class="interact-container">
        <div class="left"><svg class="reds-icon collect-icon"></svg></div>
      </div>
    `;
    const scope = window as TestWindow;
    scope.__INITIAL_STATE__ = state(false, false);
    const trustedActivate = vi.fn(async () => {
      scope.__INITIAL_STATE__ = state(false, true);
    });
    const uninstall = installBrowserStateBridge(scope);

    const result = await setDesiredInteraction(
      document,
      "synthetic-feed",
      "favorite",
      true,
      trustedActivate,
    );
    uninstall();

    expect(trustedActivate).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      active: true,
      changed: true,
      verified: true,
    });
  });

  it("点击后无法确认时要求人工核对", async () => {
    document.body.innerHTML = `
      <div class="interact-container">
        <div class="left"><button class="like-lottie"></button></div>
      </div>
    `;
    const scope = window as TestWindow;
    scope.__INITIAL_STATE__ = state(false);
    const uninstall = installBrowserStateBridge(scope);
    vi.useFakeTimers();

    const operation = setDesiredInteraction(document, "synthetic-feed", "like", true);
    const rejection = expect(operation).rejects.toBeInstanceOf(UncertainBrowserActionError);
    await vi.runAllTimersAsync();

    await rejection;
    uninstall();
  });

  it("点击前缺少控件时明确失败", async () => {
    const scope = window as TestWindow;
    scope.__INITIAL_STATE__ = state(false);
    const uninstall = installBrowserStateBridge(scope);
    vi.useFakeTimers();

    const operation = setDesiredInteraction(document, "synthetic-feed", "like", true);
    const rejection = expect(operation).rejects.toThrow("没有点赞按钮");
    await vi.runAllTimersAsync();
    await rejection;
    uninstall();
  });

  it("支持从非直接键读取状态并拒绝缺失互动字段", async () => {
    const scope = window as TestWindow;
    scope.__INITIAL_STATE__ = {
      note: {
        noteDetailMap: {
          fallback: {
            note: {
              noteId: "synthetic-feed",
              interactInfo: { liked: false, collected: false },
            },
          },
        },
      },
    };
    const uninstall = installBrowserStateBridge(scope);
    const result = await setDesiredInteraction(document, "synthetic-feed", "favorite", false);
    expect(result.changed).toBe(false);

    scope.__INITIAL_STATE__ = {
      note: { noteDetailMap: { "synthetic-feed": { note: {} } } },
    };
    await expect(setDesiredInteraction(document, "synthetic-feed", "like", true)).rejects.toThrow(
      "没有可核验的互动状态",
    );

    scope.__INITIAL_STATE__ = {
      note: {
        noteDetailMap: {
          "synthetic-feed": {
            note: {
              noteId: "other-feed",
              interactInfo: { liked: true, collected: false },
            },
          },
        },
      },
    };
    await expect(setDesiredInteraction(document, "synthetic-feed", "like", true)).rejects.toThrow(
      "不属于目标帖子",
    );
    uninstall();
  });
});
