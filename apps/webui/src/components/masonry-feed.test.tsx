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
  it("首行按从左到右的顺序铺开高低不同的帖子卡片", () => {
    const layout = calculateMasonryLayout([200, 440, 440, 200, 200], 5, 260, 20, 24);

    expect(layout.positions.map((position) => position.x)).toEqual([0, 280, 560, 840, 1120]);
    expect(layout.positions.every((position) => position.y === 0)).toBe(true);
  });

  it("首行之后每张卡都补进当前最矮的一列", () => {
    const layout = calculateMasonryLayout(
      [200, 440, 440, 200, 200, 200, 200, 200, 440, 440, 200, 200],
      5,
      260,
      20,
      24,
    );

    expect(layout.positions[5]).toEqual({ x: 0, y: 224 });
    // 第 12 张卡该去 464 高的第二列，而不是排在第二列已有卡片的下方等着。
    expect(layout.positions[11]).toEqual({ x: 280, y: 464 });
    expect(layout.height).toBe(888);
  });

  it("一张高卡不会把整列拖长，后面的卡片会绕开它", () => {
    const layout = calculateMasonryLayout([500, 100, 100, 100, 100, 100, 100], 3, 260, 20, 24);

    // 首列被 500 高的卡占住后，剩下六张都堆在另外两列，首列不再进新卡。
    expect(layout.positions[3]).toEqual({ x: 280, y: 124 });
    expect(layout.positions[6]).toEqual({ x: 560, y: 248 });
    expect(layout.height).toBe(500);
  });

  it("列高只差零点几像素时仍取最左，不被测量抖动带偏", () => {
    // 两列分别是 124.4 和 124：右列确实矮一点点，但这点差距来自高度测量，
    // 跟着它走会让本该并排的卡片左右横跳。
    const layout = calculateMasonryLayout([100.4, 100, 100], 2, 260, 20, 24);

    expect(layout.positions[2]).toEqual({ x: 0, y: 124.4 });
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
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(540);

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
    const items = view.container.querySelectorAll<HTMLElement>("[data-masonry-item]");

    // 首次定位完成前不允许过渡：瀑布流初始 transform 是 none，
    // 直接过渡会让所有卡片从左上角飞向各自位置。
    expect(feed?.dataset.settled).toBe("");
    // 错开序号由包裹层承载，卡片本身不必知道自己排第几。
    expect(items[2].style.getPropertyValue("--enter-index")).toBe("2");
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
    const defaultItem = view.container.querySelector<HTMLElement>("[data-masonry-item]");
    expect(defaultItem?.style.width).toBe("260px");

    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it("不给条件渲染出来的空节点留位置", () => {
    const parsing = false;
    const view = render(
      <MasonryFeed>
        {parsing ? <article>骨架卡</article> : null}
        <article>第一张帖子</article>
        <article>第二张帖子</article>
      </MasonryFeed>,
    );

    // 给 null 也生成包裹层的话，首列会被一张零高度的卡占住：
    // 整列往下挪一个行距，末尾还会少排一张。
    const items = view.container.querySelectorAll<HTMLElement>("[data-masonry-item]");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("第一张帖子");
    expect(items[0].style.getPropertyValue("--enter-index")).toBe("0");
  });
});
