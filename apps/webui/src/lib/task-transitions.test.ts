import { describe, expect, it } from "vitest";

import { makeDownloadTask } from "../test/fixtures";
import { describeSettled, detectSettledTasks } from "./task-transitions";

const running = makeDownloadTask({ task_id: "a", status: "running" });
const queued = makeDownloadTask({ task_id: "b", status: "queued" });

function settle(task = running, status: "completed" | "failed" = "completed") {
  return makeDownloadTask({ ...task, status });
}

describe("任务状态跃迁", () => {
  it("首次拿到列表时不补历史通知", () => {
    // 否则每次刷新页面都会把之前的下载结果重播一遍。
    expect(detectSettledTasks([], [settle()])).toEqual([]);
  });

  it("只认从进行中变为已结束的跃迁", () => {
    expect(detectSettledTasks([running], [settle()])).toHaveLength(1);
    // 一直是完成态的任务不该反复触发。
    expect(detectSettledTasks([settle()], [settle()])).toEqual([]);
    // 仍在跑的不算。
    expect(
      detectSettledTasks([queued], [makeDownloadTask({ ...queued, status: "running" })]),
    ).toEqual([]);
  });

  it("上一轮没见过的任务不触发通知", () => {
    expect(detectSettledTasks([running], [settle(queued)])).toEqual([]);
  });

  it("带出标题与落定结果", () => {
    const [item] = detectSettledTasks([running], [settle(running, "failed")]);

    expect(item.taskId).toBe("a");
    expect(item.title).toBe("合成测试帖子");
    expect(item.settledAs).toBe("failed");
  });
});

describe("落定结果文案", () => {
  it("没有落定任务时不提示", () => {
    expect(describeSettled([])).toBeNull();
  });

  it("单条成功点名标题", () => {
    const notice = describeSettled([{ taskId: "a", title: "合成帖子", settledAs: "completed" }]);

    expect(notice).toEqual({
      message: "「合成帖子」下载完成",
      tone: "success",
    });
  });

  it("多条成功只报数量", () => {
    const notice = describeSettled([
      { taskId: "a", title: "甲", settledAs: "completed" },
      { taskId: "b", title: "乙", settledAs: "completed" },
    ]);

    expect(notice?.message).toBe("2 个下载完成");
    expect(notice?.tone).toBe("success");
  });

  it("失败要指出重试去哪里找", () => {
    const notice = describeSettled([{ taskId: "a", title: "合成帖子", settledAs: "failed" }]);

    expect(notice?.message).toContain("动态里重试");
    expect(notice?.tone).toBe("error");
  });

  it("成败混杂时按失败的语气提示", () => {
    // 有失败就不能报成一片祥和，否则用户不会去看。
    const notice = describeSettled([
      { taskId: "a", title: "甲", settledAs: "completed" },
      { taskId: "b", title: "乙", settledAs: "failed" },
    ]);

    expect(notice?.message).toBe("1 个下载完成，1 个失败");
    expect(notice?.tone).toBe("error");
  });
});
