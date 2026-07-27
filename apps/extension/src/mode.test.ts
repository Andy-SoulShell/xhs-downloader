import { describe, expect, it } from "vitest";

import { buildDownloadFilename, resolveDownloadMode } from "./mode";

describe("下载模式", () => {
  it("自动模式按服务状态选择执行位置", () => {
    expect(resolveDownloadMode("auto", true)).toBe("background");
    expect(resolveDownloadMode("auto", false)).toBe("browser");
    expect(resolveDownloadMode("browser", true)).toBe("browser");
    expect(resolveDownloadMode("background", false)).toBe("background");
  });

  it("生成安全且可区分动态资源的下载路径", () => {
    expect(
      buildDownloadFilename("unsafe/work", {
        index: 2,
        kind: "live",
        suffix: "mp4",
        url: "https://example.invalid/live.mp4",
      }),
    ).toBe("xhs-downloader/unsafe_work/2_live.mp4");
    expect(
      buildDownloadFilename("safe-work", {
        index: 1,
        kind: "image",
        suffix: "jpeg",
        url: "https://example.invalid/image.jpeg",
      }),
    ).toBe("xhs-downloader/safe-work/1.jpeg");
  });
});
