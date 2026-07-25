import type { BrowserTask } from "@xhs-downloader/contracts";

/** 创建供内容脚本执行器测试使用的合成浏览器任务。 */
export function pageTask(
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
    target_driver: "extension",
    executor_id: "synthetic-extension",
    extension_id: "synthetic-extension",
    lease_expires_at: "2026-01-01T00:00:00Z",
    attempts: 1,
    message: "模拟任务",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

/** 创建带有合成初始状态脚本的独立测试文档。 */
export function statePage(state: Record<string, unknown>): Document {
  const page = document.implementation.createHTMLDocument();
  const script = page.createElement("script");
  script.textContent = `window.__INITIAL_STATE__=${JSON.stringify(state)};`;
  page.body.append(script);
  return page;
}

/** 返回推荐流与搜索解析共用的合成帖子状态。 */
export function feedState(): Record<string, unknown> {
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

/** 返回用户主页解析使用的合成页面状态。 */
export function profileState(): Record<string, unknown> {
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
