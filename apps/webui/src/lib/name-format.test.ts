import { describe, expect, it } from "vitest";

import {
  formatNameFields,
  parseNameFormat,
  previewFileName,
  usesDefaultFields,
} from "./name-format";

describe("文件命名字段", () => {
  it("解析格式并保留选择顺序", () => {
    expect(parseNameFormat("作品标题 发布时间")).toEqual(["作品标题", "发布时间"]);
  });

  it("忽略无法识别的字段与重复项", () => {
    // 服务端同样会忽略无法识别的字段，界面需保持一致。
    expect(parseNameFormat("作品标题 未知字段 作品标题")).toEqual(["作品标题"]);
    expect(parseNameFormat("")).toEqual([]);
  });

  it("还原为服务端使用的空格分隔格式", () => {
    expect(formatNameFields(["发布时间", "作品ID"])).toBe("发布时间 作品ID");
  });

  it("预览按顺序拼接示例值", () => {
    expect(previewFileName(["作者昵称", "作品标题"])).toBe("示例作者_示例标题");
  });

  it("未选择字段时预览服务端的默认组合", () => {
    expect(usesDefaultFields([])).toBe(true);
    expect(previewFileName([])).toBe("2026-07-26_示例作者_示例标题");
  });
});
