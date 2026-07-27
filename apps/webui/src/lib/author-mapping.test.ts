import { describe, expect, it } from "vitest";

import { incompleteMappingRows, toMappingObject, toMappingRows } from "./author-mapping";

describe("作者名称映射编辑", () => {
  it("展开服务端映射为可编辑行", () => {
    const rows = toMappingRows({ "author-1": "品牌号", "author-2": "备用号" });

    expect(rows.map((row) => [row.authorId, row.displayName])).toEqual([
      ["author-1", "品牌号"],
      ["author-2", "备用号"],
    ]);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
  });

  it("收敛时去除留白并忽略空行", () => {
    const mapping = toMappingObject([
      { id: "a", authorId: " author-1 ", displayName: " 品牌号 " },
      { id: "b", authorId: "", displayName: "" },
      { id: "c", authorId: "author-2", displayName: "   " },
    ]);

    expect(mapping).toEqual({ "author-1": "品牌号" });
  });

  it("同一作者重复出现时以最后一行为准", () => {
    const mapping = toMappingObject([
      { id: "a", authorId: "author-1", displayName: "旧名称" },
      { id: "b", authorId: "author-1", displayName: "新名称" },
    ]);

    expect(mapping).toEqual({ "author-1": "新名称" });
  });

  it("找出只填了一半的行", () => {
    const incomplete = incompleteMappingRows([
      { id: "a", authorId: "author-1", displayName: "品牌号" },
      { id: "b", authorId: "author-2", displayName: "" },
      { id: "c", authorId: "", displayName: "只有名称" },
      { id: "d", authorId: "", displayName: "" },
    ]);

    expect(incomplete.map((row) => row.id)).toEqual(["b", "c"]);
  });
});
