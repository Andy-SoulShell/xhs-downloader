import type { BrowserTask } from "@xhs-downloader/contracts";
import { describe, expect, it } from "vitest";

import { groupBrowserTasks } from "./browse-task-groups";

function task(overrides: Partial<BrowserTask> = {}): BrowserTask {
  return {
    task_id: "browse-1",
    request_id: null,
    kind: "get_login_qrcode",
    payload: {},
    status: "succeeded",
    result: null,
    target_driver: "extension",
    executor_id: null,
    extension_id: null,
    lease_expires_at: null,
    attempts: 1,
    message: "登录二维码已生成",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("浏览操作分组", () => {
  it("把相邻的同义记录合成一条并记下时间跨度", () => {
    const groups = groupBrowserTasks([
      task({ task_id: "a", updated_at: "2026-01-01T03:00:00Z" }),
      task({ task_id: "b", updated_at: "2026-01-01T02:00:00Z" }),
      task({ task_id: "c", updated_at: "2026-01-01T01:00:00Z" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    // 代表项取最新的一条，重试与确认都作用在它身上。
    expect(groups[0].task.task_id).toBe("a");
    expect(groups[0].earliestAt).toBe("2026-01-01T01:00:00Z");
  });

  it("失败可以合并，重试作用在最新那条", () => {
    const groups = groupBrowserTasks([
      task({ task_id: "a", status: "failed", message: "同一句失败" }),
      task({ task_id: "b", status: "failed", message: "同一句失败" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
    expect(groups[0].task.task_id).toBe("a");
  });

  it("待确认逐条保留，不能让确认按钮跟着记录一起消失", () => {
    const groups = groupBrowserTasks([
      task({ task_id: "c", status: "needs_review", message: "同一句待确认" }),
      task({ task_id: "d", status: "needs_review", message: "同一句待确认" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.count === 1)).toBe(true);
  });

  it("只合并相邻的，不打乱时间顺序", () => {
    const groups = groupBrowserTasks([
      task({ task_id: "a" }),
      task({ task_id: "b", kind: "search_feeds", message: "搜索完成" }),
      task({ task_id: "c" }),
    ]);

    expect(groups.map((group) => group.task.task_id)).toEqual(["a", "b", "c"]);
    expect(groups.map((group) => group.count)).toEqual([1, 1, 1]);
  });

  it("任一字段不同就不合并", () => {
    const groups = groupBrowserTasks([
      task({ task_id: "a", message: "登录二维码已生成" }),
      task({ task_id: "b", message: "二维码已过期" }),
      task({ task_id: "c", message: "二维码已过期", target_driver: "managed" }),
    ]);

    expect(groups).toHaveLength(3);
  });

  it("空列表返回空数组", () => {
    expect(groupBrowserTasks([])).toEqual([]);
  });
});
