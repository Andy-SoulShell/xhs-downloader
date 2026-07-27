import { describe, expect, it } from "vitest";

import { browseEmptyState } from "./browse-empty-state";

describe("浏览结果空状态", () => {
  it("正在取内容时说明要等浏览器启动", () => {
    const state = browseEmptyState({ busy: true, error: "", fetched: false });

    expect(state.title).toBe("正在打开小红书");
    expect(state.description).toContain("等浏览器启动");
  });

  it("失败时把原因摆到结果区，而不是让人重做刚失败的动作", () => {
    const state = browseEmptyState({
      busy: false,
      error: "受管浏览器还没启动",
      fetched: false,
    });

    expect(state.title).toBe("没能取到内容");
    expect(state.description).toBe("受管浏览器还没启动。");
    // 此前这里写的是“点上面的「看看推荐」”，等于让人把刚失败的那一步再做一遍。
    expect(state.description).not.toContain("看看推荐");
  });

  it("原因自带句号时不再补一个", () => {
    const state = browseEmptyState({ busy: false, error: "先登录再试。", fetched: false });

    expect(state.description).toBe("先登录再试。");
  });

  it("取到过内容但结果为空时说没找到，而不是还没有内容", () => {
    const state = browseEmptyState({ busy: false, error: "", fetched: true });

    expect(state.title).toBe("没有找到相关内容");
  });

  it("从没取过内容时才是还没有内容", () => {
    const state = browseEmptyState({ busy: false, error: "", fetched: false });

    expect(state.title).toBe("还没有内容");
    expect(state.description).toContain("看看推荐");
  });
});
