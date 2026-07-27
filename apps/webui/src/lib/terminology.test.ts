import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  browseStatusCopy,
  downloadStatusCopy,
  humanizeError,
  postStatusCopy,
  publishStatusCopy,
} from "./terminology";

describe("界面术语基线", () => {
  it("同一件事在各处使用同一个词", () => {
    // 下载完成此前在三处分别写作已完成、已下载和完成。
    expect(downloadStatusCopy.completed.label).toBe("已下载");
    expect(postStatusCopy.done.label).toBe("已下载");

    // 结果待人工核对此前在两处分别写作需要确认和待确认。
    expect(publishStatusCopy.needs_review.label).toBe("需要你确认结果");
    expect(browseStatusCopy.needs_review.label).toBe("需要你确认结果");
  });

  it("需要用户行动的状态必须给出下一步", () => {
    const actionable = [
      downloadStatusCopy.failed,
      publishStatusCopy.needs_review,
      publishStatusCopy.awaiting_verification,
      publishStatusCopy.failed,
      browseStatusCopy.needs_review,
      browseStatusCopy.failed,
    ];

    for (const status of actionable) {
      expect(status.hint, `${status.label} 缺少下一步提示`).toBeTruthy();
    }
  });

  it("进行中与成功状态不写多余提示", () => {
    expect(downloadStatusCopy.running.hint).toBeUndefined();
    expect(downloadStatusCopy.completed.hint).toBeUndefined();
    expect(publishStatusCopy.published.hint).toBeUndefined();
    expect(browseStatusCopy.succeeded.hint).toBeUndefined();
  });

  it("状态文案不泄露内部概念", () => {
    const forbidden = ["驱动", "执行器", "租约", "提供方", "指纹", "领取", "回退", "快照"];
    const texts = [
      ...Object.values(downloadStatusCopy),
      ...Object.values(publishStatusCopy),
      ...Object.values(browseStatusCopy),
      ...Object.values(postStatusCopy),
    ].flatMap((status) => [status.label, status.hint ?? ""]);

    for (const text of texts) {
      for (const word of forbidden) {
        expect(text, `"${text}" 含内部术语 ${word}`).not.toContain(word);
      }
    }
  });

  it("把服务端原始错误换成日常说法", () => {
    expect(humanizeError("请求失败（HTTP 500）")).toBe("本地服务出错了，请稍后重试。");
    expect(humanizeError("请求失败（HTTP 403）")).toBe("这个操作只能在本机使用。");
    expect(humanizeError("Failed to fetch")).toBe("连接不上本地服务，请确认它正在运行。");
    expect(humanizeError("当前浏览器执行器尚未支持post_comment任务，请改用其他执行器")).toBe(
      "当前连接方式不支持这个操作，换一种连接方式即可。",
    );
  });

  it("无法识别的错误保留原文而不是吞掉", () => {
    expect(humanizeError("素材超过单个文件大小上限")).toBe("素材超过单个文件大小上限");
  });
});

/**
 * 界面文案里禁止出现的内部概念。
 *
 * 与 terminology 模块顶部的约定一致；此前那份清单只扫这个模块自己的文案
 * 表，于是同样的词在组件里出现了几十处也没人拦。
 */
const FORBIDDEN_TERMS = ["驱动", "执行器", "租约", "提供方", "指纹", "领取", "受管", "首期"];

// vitest 的工作目录是 apps/webui；import.meta.url 在 jsdom 下不是 file: 协议。
const SOURCE_ROOT = join(process.cwd(), "src");

/** 收集组件与工具模块的源码路径，跳过测试与类型声明。 */
function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(full);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) return [];
    return [full];
  });
}

/** 抹掉注释但保留行号，剩下的中文基本只可能出现在会渲染出去的文本里。 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

describe("界面文案不泄露内部概念", () => {
  it("组件与工具模块的文案里没有内部术语", () => {
    const files = [
      ...collectSourceFiles(join(SOURCE_ROOT, "components")),
      ...collectSourceFiles(join(SOURCE_ROOT, "lib")),
    ];
    const violations: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      // 少数地方要拿内部词去匹配服务端消息，那不是界面文案；这类行必须在
      // 同一行或上一行的注释里写明「术语例外」及理由，才不算违规。
      const exempt = new Set(
        source
          .split("\n")
          .flatMap((line, index) => (line.includes("术语例外") ? [index, index + 1] : [])),
      );
      const lines = stripComments(source).split("\n");
      lines.forEach((line, index) => {
        if (exempt.has(index)) return;
        for (const term of FORBIDDEN_TERMS) {
          if (line.includes(term)) {
            violations.push(`${relative(SOURCE_ROOT, file)}:${index + 1} 含「${term}」`);
          }
        }
      });
    }

    expect(violations, `共 ${violations.length} 处内部术语外泄`).toEqual([]);
  });
});
