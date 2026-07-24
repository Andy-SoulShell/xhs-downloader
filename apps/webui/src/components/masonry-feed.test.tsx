import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { calculateMasonryLayout } from "../lib/masonry";
import { MasonryFeed } from "./masonry-feed";

const originalResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  vi.restoreAllMocks();
});

describe("calculateMasonryLayout", () => {
  it("按从左到右的顺序分配高低不同的帖子卡片", () => {
    const layout = calculateMasonryLayout(
      [200, 440, 440, 200, 200, 200, 200, 200, 440, 440, 200, 200],
      5,
      260,
      20,
      24,
    );

    expect(layout.positions[5]).toEqual({ x: 0, y: 224 });
    expect(layout.positions[11]).toEqual({ x: 280, y: 688 });
    expect(layout.height).toBe(888);
  });

  it("不会因为中间列较短而改变下一行的阅读顺序", () => {
    const layout = calculateMasonryLayout(
      [500, 100, 100, 100, 100, 100, 100],
      3,
      260,
      20,
      24,
    );

    expect(layout.positions[3]).toEqual({ x: 0, y: 524 });
    expect(layout.positions[6]).toEqual({ x: 0, y: 648 });
  });

  it("空列表不会产生负数容器高度", () => {
    expect(calculateMasonryLayout([], 3, 260, 20, 24)).toEqual({
      height: 0,
      positions: [],
    });
  });
});

describe("MasonryFeed", () => {
  it("根据卡片高度设置位置并在卸载时停止观察", () => {
    const disconnect = vi.fn();
    class ImmediateResizeObserver {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe() {
        this.callback([], this as unknown as ResizeObserver);
      }

      unobserve() {}

      disconnect() {
        disconnect();
      }
    }
    globalThis.ResizeObserver = ImmediateResizeObserver;
    let animationCallback: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationCallback = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    let cssValues: Record<string, string> = {
      "--feed-min-card-width": "260",
      "--feed-column-gap": "20",
      "--feed-row-gap": "24",
    };
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (name: string) => cssValues[name] ?? "",
    } as CSSStyleDeclaration);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.spyOn(
      HTMLElement.prototype,
      "clientWidth",
      "get",
    ).mockReturnValue(540);

    const view = render(
      <MasonryFeed>
        <article>第一张帖子</article>
        <article>第二张帖子</article>
        <article>第三张帖子</article>
      </MasonryFeed>,
    );
    expect(animationCallback).toBeTypeOf("function");
    act(() => animationCallback?.(0));
    const feed = view.container.querySelector<HTMLElement>(".feed-masonry");
    const items = view.container.querySelectorAll<HTMLElement>(
      "[data-masonry-item]",
    );

    expect(feed?.style.height).toBe("224px");
    expect(items[0].style.transform).toBe("translate3d(0px, 0px, 0)");
    expect(items[0].style.width).toBe("260px");
    expect(items[2].style.transform).toBe("translate3d(0px, 124px, 0)");

    cssValues = {};
    view.rerender(
      <MasonryFeed>
        <article>使用默认布局参数</article>
      </MasonryFeed>,
    );
    act(() => animationCallback?.(0));
    const defaultItem = view.container.querySelector<HTMLElement>(
      "[data-masonry-item]",
    );
    expect(defaultItem?.style.width).toBe("260px");

    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });
});
