import { describe, expect, it, vi } from "vitest";

import type { BrowserTask } from "@xhs-downloader/contracts";

import {
  executeBrowserPageTask,
  isBrowserPageTaskRequest,
} from "./browser-page-runner";
import { installBrowserStateBridge } from "./browser-state-main";
import {
  feedState,
  pageTask as task,
  profileState,
  statePage,
} from "./browser-page-test-helpers";

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

  it("从登录页返回短期二维码", async () => {
    const page = document.implementation.createHTMLDocument();
    page.body.innerHTML = `
      <div class="login-container">
        <img class="qrcode-img" src="data:image/png;base64,c3ludGhldGljLXFy">
      </div>
    `;

    const response = await executeBrowserPageTask(
      task("get_login_qrcode"),
      page,
      "https://www.xiaohongshu.com/explore",
    );

    expect(response).toMatchObject({
      ok: true,
      result: {
        is_logged_in: false,
        image_data_url: "data:image/png;base64,c3ludGhldGljLXFy",
        consumed: false,
      },
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
      statePage({
        user: {
          userPageData: {
            value: { basicInfo: { nickname: "合成用户" }, interactions: [] },
          },
          notes: { value: [] },
        },
      }),
      "https://www.xiaohongshu.com/user/profile/synthetic-user",
    );

    expect(specified.result).toMatchObject({ user_id: "synthetic-user" });
    expect(mine.message).toBe("当前账号主页读取完成");
    expect(mine.result).toMatchObject({ user_id: "synthetic-user" });
  });

  it("从首页请求导航到当前账号主页", async () => {
    const page = document.implementation.createHTMLDocument();
    page.body.innerHTML = `
      <div class="main-container">
        <div class="user">
          <a id="profile-link" href="https://www.xiaohongshu.com/user/profile/synthetic-user"></a>
        </div>
      </div>
    `;
    const click = vi.spyOn(
      page.querySelector("#profile-link") as HTMLAnchorElement,
      "click",
    );

    const response = await executeBrowserPageTask(
      task("get_my_profile"),
      page,
      "https://www.xiaohongshu.com/explore",
    );

    expect(click).toHaveBeenCalledOnce();
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

  it("等待无筛选搜索的异步结果", async () => {
    const scope = window as Window & { __INITIAL_STATE__?: unknown };
    scope.__INITIAL_STATE__ = { search: { feeds: { value: [] } } };
    const uninstall = installBrowserStateBridge(scope);
    vi.useFakeTimers();
    try {
      setTimeout(() => {
        scope.__INITIAL_STATE__ = {
          search: { feeds: { value: [feedState()] } },
        };
      }, 500);
      const operation = executeBrowserPageTask(
        task("search_feeds", {
          keyword: "合成关键词",
          filters: {},
        }),
        document,
        "https://www.xiaohongshu.com/search_result",
      );
      await vi.runAllTimersAsync();

      await expect(operation).resolves.toMatchObject({
        result: { items: [{ feed_id: "synthetic-feed" }] },
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
