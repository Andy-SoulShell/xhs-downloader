import { afterEach, describe, expect, it, vi } from "vitest";

import { executeReadCapability } from "./browser-api";
import {
  appendUniqueFeeds,
  feedContextFrom,
  loadNextFeedPage,
} from "./feed-pagination";
import {
  browserReadRouteFixture,
  makeBrowserFeedList,
} from "../test/browser-explorer-fixtures";
import type { FeedSummary } from "./types";

vi.mock("./browser-api", () => ({ executeReadCapability: vi.fn() }));

afterEach(() => vi.clearAllMocks());

function feed(id: string): FeedSummary {
  return {
    ...makeBrowserFeedList().items[0],
    feed_id: id,
  };
}

describe("浏览结果分页", () => {
  it("从读取结果记录来源与游标", () => {
    const result = { ...makeBrowserFeedList(), cursor: "c1", has_more: true };

    expect(feedContextFrom("search", "露营", result)).toEqual({
      source: "search",
      keyword: "露营",
      cursor: "c1",
      hasMore: true,
    });
  });

  it("搜索翻页沿用关键词与游标", async () => {
    vi.mocked(executeReadCapability).mockResolvedValue({
      data: { ...makeBrowserFeedList(), cursor: "c2", has_more: false },
      route: browserReadRouteFixture,
    });

    const page = await loadNextFeedPage(
      { source: "search", keyword: "露营", cursor: "c1", hasMore: true },
      new AbortController().signal,
    );

    expect(executeReadCapability).toHaveBeenCalledWith(
      "/xhs/feeds/search",
      { keyword: "露营", filters: {}, cursor: "c1" },
      expect.any(AbortSignal),
    );
    expect(page.context).toMatchObject({ cursor: "c2", hasMore: false });
  });

  it("推荐翻页只带游标", async () => {
    vi.mocked(executeReadCapability).mockResolvedValue({
      data: makeBrowserFeedList(),
      route: browserReadRouteFixture,
    });

    await loadNextFeedPage(
      { source: "home", keyword: "", cursor: "c1", hasMore: true },
      new AbortController().signal,
    );

    expect(executeReadCapability).toHaveBeenCalledWith(
      "/xhs/feeds/list",
      { cursor: "c1" },
      expect.any(AbortSignal),
    );
  });

  it("追加时按帖子标识去重", () => {
    const merged = appendUniqueFeeds(
      [feed("a"), feed("b")],
      [feed("b"), feed("c")],
    );

    expect(merged.map((item) => item.feed_id)).toEqual(["a", "b", "c"]);
  });
});
