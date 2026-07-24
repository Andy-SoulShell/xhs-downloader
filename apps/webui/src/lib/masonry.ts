interface MasonryPosition {
  x: number;
  y: number;
}

interface MasonryLayout {
  height: number;
  positions: MasonryPosition[];
}

/**
 * 按逐行入列策略计算瀑布流位置。
 *
 * @param heights 按展示顺序排列的卡片高度。
 * @param columnCount 当前断点下的列数。
 * @param columnWidth 单列宽度，单位为像素。
 * @param columnGap 列间距，单位为像素。
 * @param rowGap 同列卡片间距，单位为像素。
 * @returns 容器高度和每张卡片的位置。
 */
export function calculateMasonryLayout(
  heights: number[],
  columnCount: number,
  columnWidth: number,
  columnGap: number,
  rowGap: number,
): MasonryLayout {
  const columnHeights = Array.from({ length: columnCount }, () => 0);
  const positions = heights.map((height, index) => {
    const column = index % columnCount;
    const position = {
      x: column * (columnWidth + columnGap),
      y: columnHeights[column],
    };
    columnHeights[column] += height + rowGap;
    return position;
  });
  return {
    height: Math.max(0, ...columnHeights) - (heights.length ? rowGap : 0),
    positions,
  };
}
