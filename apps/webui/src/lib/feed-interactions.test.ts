import { describe, expect, it } from "vitest";

import {
  commentRequest,
  desiredStateRequest,
  metricKeyOf,
  replyRequest,
} from "./feed-interactions";
import { browserDetailFixture } from "../test/browser-explorer-fixtures";

const detail = browserDetailFixture;

describe("帖子互动请求", () => {
  it("点赞与收藏使用各自接口并冻结访问上下文", () => {
    expect(desiredStateRequest(detail, "like", true)).toEqual({
      path: "/xhs/feeds/like",
      payload: {
        feed_id: detail.feed_id,
        xsec_token: detail.xsec_token,
        active: true,
      },
    });
    expect(desiredStateRequest(detail, "favorite", false)?.path).toBe("/xhs/feeds/favorite");
  });

  it("评论与回复带上正文和被回复对象", () => {
    expect(commentRequest(detail, "合成评论")?.payload).toMatchObject({
      content: "合成评论",
    });
    expect(replyRequest(detail, "synthetic-comment", "合成回复")?.payload).toMatchObject({
      comment_id: "synthetic-comment",
      content: "合成回复",
      user_id: null,
    });
  });

  it("没有打开详情时不构造请求", () => {
    expect(desiredStateRequest(null, "like", true)).toBeNull();
    expect(commentRequest(null, "合成评论")).toBeNull();
    expect(replyRequest(null, "synthetic-comment", "合成回复")).toBeNull();
  });

  it("把互动类型映射到详情指标字段", () => {
    expect(metricKeyOf("like")).toBe("liked");
    expect(metricKeyOf("favorite")).toBe("collected");
  });
});
