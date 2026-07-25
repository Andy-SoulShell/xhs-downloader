import { describe, expect, it, vi } from "vitest";

import type { BrowserTask } from "@xhs-downloader/contracts";

import {
  executeBrowserPageTask,
  isBrowserPageTaskRequest,
} from "./browser-page-runner";
import { installBrowserStateBridge } from "./browser-state-main";

function task(
  kind: BrowserTask["kind"],
  payload: BrowserTask["payload"] = {},
): BrowserTask {
  return {
    task_id: "synthetic-task",
    request_id: null,
    kind,
    payload,
    status: "claimed",
    result: null,
    extension_id: "synthetic-extension",
    lease_expires_at: "2026-01-01T00:00:00Z",
    attempts: 1,
    message: "模拟任务",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function statePage(state: Record<string, unknown>): Document {
  const page = document.implementation.createHTMLDocument();
  const script = page.createElement("script");
  script.textContent = `window.__INITIAL_STATE__=${JSON.stringify(state)};`;
  page.body.append(script);
  return page;
}

function feedState() {
  return {
    id: "synthetic-feed",
    xsecToken: "synthetic-token",
    noteCard: {
      type: "normal",
      displayTitle: "合成帖子",
      user: { userId: "synthetic-author", nickname: "合成作者" },
    },
  };
}

function profileState() {
  return {
    user: {
      userPageData: {
        value: {
          basicInfo: {
            userId: "synthetic-user",
            nickname: "合成用户",
          },
          interactions: [],
        },
      },
      notes: { value: [] },
    },
  };
}

describe("内容脚本浏览器任务执行器", () => {
  it("执行登录状态任务并返回结构化结果", async () => {
    const page = document.implementation.createHTMLDocument();
    page.body.innerHTML =
      '<div class="main-container"><div class="user"><a class="link-wrapper"><i class="channel"></i></a></div></div>';

    const response = await executeBrowserPageTask(
      task("check_login_status"),
      page,
      "https://www.xiaohongshu.com/explore",
    );

    expect(response.ok).toBe(true);
    expect(response.result).toEqual({
      logged_in: true,
      user_id: null,
      nickname: null,
    });
  });

  it("明确拒绝未知任务类型", async () => {
    const page = document.implementation.createHTMLDocument();
    const response = await executeBrowserPageTask(
      task("unknown" as BrowserTask["kind"]),
      page,
      "https://www.xiaohongshu.com/explore",
    );

    expect(response.ok).toBe(false);
    expect(response.message).toContain("unknown");
    expect(isBrowserPageTaskRequest({ type: "browser-page-task" })).toBe(true);
    expect(isBrowserPageTaskRequest({ type: "download" })).toBe(false);
  });

  it("执行推荐流与默认筛选搜索任务", async () => {
    const home = await executeBrowserPageTask(
      task("list_feeds"),
      statePage({ feed: { feeds: { value: [feedState()] } } }),
      "https://www.xiaohongshu.com/explore",
    );
    const search = await executeBrowserPageTask(
      task("search_feeds", {
        keyword: "合成关键词",
        filters: {
          sort_by: "综合",
          note_type: "不限",
          publish_time: "不限",
          search_scope: "不限",
          location: "不限",
        },
      }),
      statePage({ search: { feeds: { value: [feedState()] } } }),
      "https://www.xiaohongshu.com/search_result",
    );

    expect(home.result).toMatchObject({
      source: "home",
      items: [{ feed_id: "synthetic-feed" }],
    });
    expect(search.result).toMatchObject({
      source: "search",
      keyword: "合成关键词",
    });
  });

  it("执行帖子详情任务并验证数值参数", async () => {
    const page = statePage({
      note: {
        noteDetailMap: {
          "synthetic-feed": {
            note: {
              noteId: "synthetic-feed",
              type: "normal",
              user: { userId: "synthetic-author" },
            },
            comments: { value: { list: [] } },
          },
        },
      },
    });
    const payload = {
      feed_id: "synthetic-feed",
      xsec_token: "synthetic-token",
      comment_limit: 10,
      include_replies: false,
      reply_limit: 5,
    };

    const response = await executeBrowserPageTask(
      task("get_feed_detail", payload),
      page,
      "https://www.xiaohongshu.com/explore/synthetic-feed",
    );

    expect(response.result).toMatchObject({ feed_id: "synthetic-feed" });
    await expect(
      executeBrowserPageTask(
        task("get_feed_detail", { ...payload, comment_limit: 1.5 }),
        page,
        "https://www.xiaohongshu.com/explore/synthetic-feed",
      ),
    ).rejects.toThrow("comment_limit 无效");
  });

  it("读取指定用户与当前账号主页", async () => {
    const specified = await executeBrowserPageTask(
      task("get_user_profile", { user_id: "synthetic-user" }),
      statePage(profileState()),
      "https://www.xiaohongshu.com/user/profile/synthetic-user",
    );
    const mine = await executeBrowserPageTask(
      task("get_my_profile"),
      statePage(profileState()),
      "https://www.xiaohongshu.com/user/profile/synthetic-user",
    );

    expect(specified.result).toMatchObject({ user_id: "synthetic-user" });
    expect(mine.message).toBe("当前账号主页读取完成");
  });

  it("从首页请求导航到当前账号主页", async () => {
    const page = document.implementation.createHTMLDocument();
    page.body.innerHTML = `
      <div class="main-container">
        <div class="user">
          <a href="https://www.xiaohongshu.com/user/profile/synthetic-user"></a>
        </div>
      </div>
    `;

    const response = await executeBrowserPageTask(
      task("get_my_profile"),
      page,
      "https://www.xiaohongshu.com/explore",
    );

    expect(response.navigateUrl).toContain("/user/profile/synthetic-user");
  });

  it("操作搜索筛选并读取主世界中的最新结果", async () => {
    document.body.innerHTML = `
      <div class="filter">筛选</div>
      <div class="filter-panel">
        <div class="filters">
          <div class="tags">综合</div>
          <div class="tags" id="latest-filter">最新</div>
        </div>
      </div>
    `;
    const clicked = vi.fn();
    document.querySelector("#latest-filter")?.addEventListener("click", clicked);
    const scope = window as Window & { __INITIAL_STATE__?: unknown };
    scope.__INITIAL_STATE__ = {
      search: { feeds: { value: [feedState()] } },
    };
    const uninstall = installBrowserStateBridge(scope);
    vi.useFakeTimers();
    try {
      const operation = executeBrowserPageTask(
        task("search_feeds", {
          keyword: "合成关键词",
          filters: { sort_by: "最新" },
        }),
        document,
        "https://www.xiaohongshu.com/search_result",
      );
      await vi.runAllTimersAsync();
      const response = await operation;

      expect(clicked).toHaveBeenCalledOnce();
      expect(response.result).toMatchObject({
        items: [{ feed_id: "synthetic-feed" }],
      });
    } finally {
      vi.useRealTimers();
      uninstall();
      delete scope.__INITIAL_STATE__;
    }
  });

  it("拒绝缺失参数和缺失主页入口", async () => {
    const page = statePage({ search: { feeds: { value: [] } } });
    await expect(
      executeBrowserPageTask(
        task("search_feeds"),
        page,
        "https://www.xiaohongshu.com/search_result",
      ),
    ).rejects.toThrow("缺少参数 keyword");
    await expect(
      executeBrowserPageTask(
        task("get_my_profile"),
        document.implementation.createHTMLDocument(),
        "https://www.xiaohongshu.com/explore",
      ),
    ).rejects.toThrow("没有已登录账号的主页入口");
  });
});
