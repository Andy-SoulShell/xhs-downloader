interface MasonryPosition {
  x: number;
  y: number;
}

interface MasonryLayout {
  height: number;
  positions: MasonryPosition[];
}

/* 卡片高度来自 getBoundingClientRect，同样高的两张卡也可能差几个千分位。
   不留容差的话，最矮列会被这点抖动决定，同一行的卡片就会左右乱跳。 */
const COLUMN_HEIGHT_TOLERANCE = 1;

/**
 * 按最矮列优先的策略计算瀑布流位置。
 *
 * 逐行入列（第 n 张固定进第 n % 列数 列）会把高矮不一的卡片摊成对齐的行：
 * 矮卡下面留一大片空白，末尾还会有几列比别人少一张。
 * 这里改成每张卡都进当前最矮的一列，等高时取最左，
 * 首行仍是从左往右的阅读顺序，后面则贴着上一张往上收。
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
  const positions = heights.map((height) => {
    let column = 0;
    for (let candidate = 1; candidate < columnCount; candidate += 1) {
      if (columnHeights[candidate] < columnHeights[column] - COLUMN_HEIGHT_TOLERANCE) {
        column = candidate;
      }
    }
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
