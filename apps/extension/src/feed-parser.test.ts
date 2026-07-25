import { describe, expect, it } from "vitest";

import { parseFeedDetailDocument } from "./feed-detail-parser";
import { parseFeedListDocument } from "./feed-parser";
import { parseUserProfileDocument } from "./profile-parser";

const FEED_ID = "synthetic-feed";

function pageWithState(state: Record<string, unknown>): Document {
  const page = document.implementation.createHTMLDocument();
  const script = page.createElement("script");
  script.textContent = `window.__INITIAL_STATE__=${JSON.stringify(state)};`;
  page.body.append(script);
  return page;
}

function feed(overrides: Record<string, unknown> = {}) {
  return {
    id: FEED_ID,
    xsecToken: "synthetic-token",
    noteCard: {
      type: "normal",
      displayTitle: "合成帖子",
      user: {
        userId: "synthetic-author",
        nickname: "合成作者",
        avatar: "https://example.invalid/avatar.png",
      },
      interactInfo: {
        liked: true,
        likedCount: "12",
        collected: false,
        collectedCount: "3",
        commentCount: "4",
        sharedCount: "5",
      },
      cover: {
        urlDefault: "https://example.invalid/cover.png",
        width: 1080,
        height: 1440,
      },
    },
    ...overrides,
  };
}

describe("浏览结果解析器", () => {
  it("解析推荐流、搜索结果与嵌套帖子数组", () => {
    const home = parseFeedListDocument(
      pageWithState({
        feed: {
          feeds: { value: [feed()] },
          hasMore: true,
          cursor: "synthetic-cursor",
        },
      }),
      "home",
    );
    const search = parseFeedListDocument(
      pageWithState({
        search: { feeds: { _value: [[feed({ id: "search-feed" })]] } },
      }),
      "search",
      "合成关键词",
    );

    expect(home.items[0]).toMatchObject({
      feed_id: FEED_ID,
      title: "合成帖子",
      note_type: "image",
      author: { user_id: "synthetic-author", nickname: "合成作者" },
      metrics: { liked: true, liked_count: "12" },
      cover_width: 1080,
    });
    expect(home).toMatchObject({
      has_more: true,
      cursor: "synthetic-cursor",
    });
    expect(search).toMatchObject({
      keyword: "合成关键词",
      source: "search",
      items: [{ feed_id: "search-feed" }],
    });
  });

  it("截断超长内容和过量帖子，保持结果契约可验证", () => {
    const manyFeeds = Array.from({ length: 205 }, (_, index) =>
      feed({
        id: `synthetic-${index}`,
        noteCard: {
          ...feed().noteCard,
          displayTitle: "标题".repeat(300),
        },
      }),
    );
    const list = parseFeedListDocument(
      pageWithState({ feed: { feeds: { value: manyFeeds } } }),
      "home",
    );

    expect(list.items).toHaveLength(200);
    expect(list.items[0].title.length).toBe(500);
  });

  it("解析帖子正文、图片、互动状态和回复", () => {
    const page = pageWithState({
      note: {
        noteDetailMap: {
          [FEED_ID]: {
            note: {
              noteId: FEED_ID,
              xsecToken: "returned-token",
              type: "normal",
              title: "合成详情",
              desc: "仅用于自动化测试",
              time: 1_700_000_000_000,
              ipLocation: "合成地点",
              user: {
                userId: "synthetic-author",
                nickname: "合成作者",
              },
              interactInfo: { commentCount: "1" },
              imageList: [
                { urlDefault: "https://example.invalid/image.png" },
              ],
            },
            comments: {
              value: {
                hasMore: true,
                cursor: "synthetic-cursor",
                list: [
                  {
                    id: "comment-1",
                    content: "合成评论",
                    createTime: 1_700_000_000_001,
                    userInfo: {
                      userId: "comment-author",
                      nickname: "评论作者",
                    },
                    subCommentCount: "1",
                    subComments: {
                      value: [
                        {
                          id: "reply-1",
                          content: "合成回复",
                          userInfo: {
                            userId: "reply-author",
                            nickname: "回复作者",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
    });

    const detail = parseFeedDetailDocument(page, {
      feedId: FEED_ID,
      xsecToken: "requested-token",
      commentLimit: 10,
      includeReplies: true,
      replyLimit: 10,
    });

    expect(detail).toMatchObject({
      feed_id: FEED_ID,
      xsec_token: "returned-token",
      title: "合成详情",
      image_urls: ["https://example.invalid/image.png"],
      comments_has_more: true,
      comments: [
        {
          comment_id: "comment-1",
          replies: [{ comment_id: "reply-1", content: "合成回复" }],
        },
      ],
    });
  });

  it("解析用户资料、统计项和双层帖子数组", () => {
    const profile = parseUserProfileDocument(
      pageWithState({
        user: {
          userPageData: {
            value: {
              basicInfo: {
                userId: "synthetic-user",
                nickname: "合成用户",
                redId: "synthetic-red-id",
                desc: "合成简介",
                imageb: "https://example.invalid/profile.png",
                ipLocation: "合成地点",
              },
              interactions: [
                { name: "获赞与收藏", count: "88", type: "likes" },
              ],
            },
          },
          notes: { value: [[feed()]] },
        },
      }),
      "requested-user",
    );

    expect(profile).toMatchObject({
      user_id: "synthetic-user",
      nickname: "合成用户",
      red_id: "synthetic-red-id",
      metrics: [{ name: "获赞与收藏", count: "88" }],
      feeds: [{ feed_id: FEED_ID }],
    });
  });

  it("拒绝详情页返回其他帖子的数据", () => {
    const page = pageWithState({
      note: {
        noteDetailMap: {
          stale: {
            note: {
              noteId: "stale",
              user: { userId: "synthetic-author" },
            },
          },
        },
      },
    });

    expect(() =>
      parseFeedDetailDocument(page, {
        feedId: FEED_ID,
        xsecToken: "synthetic-token",
        commentLimit: 0,
        includeReplies: false,
        replyLimit: 0,
      }),
    ).toThrow("没有请求的帖子数据");
  });
});
