import { Children, type CSSProperties, type ReactNode, useLayoutEffect, useRef } from "react";

import { calculateMasonryLayout } from "../lib/masonry";

interface MasonryFeedProps {
  children: ReactNode;
}

/**
 * 使用实际卡片高度进行逐行入列的帖子瀑布流。
 *
 * @param props 组件属性。
 * @param props.children 按阅读顺序排列的帖子卡片。
 * @returns 可随容器和媒体尺寸变化重新排版的瀑布流。
 */
export function MasonryFeed({ children }: MasonryFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let animationFrame = 0;

    const layout = () => {
      const items = Array.from(container.querySelectorAll<HTMLElement>("[data-masonry-item]"));
      const styles = getComputedStyle(container);
      const columnGap = Number.parseFloat(styles.getPropertyValue("--feed-column-gap")) || 20;
      const rowGap = Number.parseFloat(styles.getPropertyValue("--feed-row-gap")) || 24;
      const minimumWidth =
        Number.parseFloat(styles.getPropertyValue("--feed-min-card-width")) || 260;
      const columns = Math.max(
        1,
        Math.floor((container.clientWidth + columnGap) / (minimumWidth + columnGap)),
      );
      const columnWidth = (container.clientWidth - columnGap * (columns - 1)) / columns;

      items.forEach((item) => {
        item.style.width = `${columnWidth}px`;
      });
      const result = calculateMasonryLayout(
        items.map((item) => item.getBoundingClientRect().height),
        columns,
        columnWidth,
        columnGap,
        rowGap,
      );
      items.forEach((item, index) => {
        const position = result.positions[index];
        item.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
      });
      container.style.height = `${result.height}px`;
      // 首次定位完成后才允许过渡，否则卡片会从左上角飞向各自位置。
      container.dataset.settled = "";
    };

    const scheduleLayout = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(layout);
    };
    const observer = new ResizeObserver(scheduleLayout);
    observer.observe(container);
    container
      .querySelectorAll<HTMLElement>("[data-masonry-item]")
      .forEach((item) => observer.observe(item));
    scheduleLayout();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [children]);

  return (
    <div className="feed-masonry" ref={containerRef}>
      {Children.map(children, (child, index) => (
        <div
          className="feed-masonry-item"
          data-masonry-item
          style={{ "--enter-index": index } as CSSProperties}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
