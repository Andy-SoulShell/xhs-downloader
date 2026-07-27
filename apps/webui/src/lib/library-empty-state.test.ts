import { describe, expect, it } from "vitest";

import { libraryEmptyState } from "./library-empty-state";

describe("帖子列表空状态", () => {
  it("服务不可达时说清原因并要求给出重试入口", () => {
    // 此前无论服务在不在，空列表都提示“粘贴链接”，而服务挂掉时
    // 再怎么粘贴也不会成功，用户会一直卡在这里。
    const state = libraryEmptyState({ online: false, totalPosts: 0 });

    expect(state.title).toBe("连接不上本地服务");
    expect(state.offline).toBe(true);
    expect(state.description).not.toContain("粘贴");
  });

  it("服务正常但一条都没有时引导粘贴链接", () => {
    const state = libraryEmptyState({ online: true, totalPosts: 0 });

    expect(state.title).toBe("帖子列表还是空的");
    expect(state.offline).toBe(false);
    expect(state.description).toContain("xhslink.cn");
  });

  it("探测未完成时不误报离线", () => {
    expect(libraryEmptyState({ online: null, totalPosts: 0 }).offline).toBe(
      false,
    );
  });

  it("有帖子但被筛掉时归因于筛选条件", () => {
    // 服务此刻掉线也一样：帖子已经在手上，用户要解决的是筛选条件。
    for (const online of [true, false, null]) {
      const state = libraryEmptyState({ online, totalPosts: 12 });
      expect(state.title).toBe("没有符合条件的帖子");
      expect(state.offline).toBe(false);
    }
  });
});
