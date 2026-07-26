import { describe, expect, it } from "vitest";

import { feedPostUrl } from "./feed-links";

describe("浏览结果的下载链接", () => {
  it("带上访问上下文构造帖子链接", () => {
    const url = feedPostUrl({
      feed_id: "synthetic-feed",
      xsec_token: "synthetic-token",
    });

    expect(url).toBe(
      "https://www.xiaohongshu.com/explore/synthetic-feed?xsec_token=synthetic-token&xsec_source=pc_feed",
    );
  });

  it("缺少访问上下文时不构造必定失败的链接", () => {
    // 去掉 xsec_token 后连公开帖子也可能解析不到内容，宁可不给链接。
    expect(
      feedPostUrl({ feed_id: "synthetic-feed", xsec_token: "" }),
    ).toBeNull();
    expect(
      feedPostUrl({ feed_id: "", xsec_token: "synthetic-token" }),
    ).toBeNull();
  });

  it("对访问上下文做转义", () => {
    const url = feedPostUrl({
      feed_id: "synthetic-feed",
      xsec_token: "a b&c=d",
    });

    expect(url).toContain("xsec_token=a+b%26c%3Dd");
  });
});
