import { describe, expect, it } from "vitest";

import { makePublicationDraft, makePublicationTask } from "../test/fixtures";
import {
  attentionTaskCount,
  draftStageLabel,
  draftSummary,
  draftTitle,
  filterDrafts,
  indexTasksByDraft,
  orderTasksByAttention,
  summarizeDrafts,
} from "./publication-index";

const CONTENT = "c".repeat(64);

function draftOf(draftId: string, overrides = {}) {
  return makePublicationDraft({ draft_id: draftId, ...overrides });
}

function taskOf(draftId: string, overrides: Record<string, unknown> = {}) {
  const task = makePublicationTask(overrides);
  return { ...task, package: { ...task.package, draft_id: draftId } };
}

describe("草稿与发布任务的关联", () => {
  it("按源草稿归拢任务并把最近一次排在最前", () => {
    const index = indexTasksByDraft([
      taskOf("a", { task_id: "旧", created_at: "2026-01-01T00:00:00Z" }),
      taskOf("b", { task_id: "别人的" }),
      taskOf("a", { task_id: "新", created_at: "2026-03-01T00:00:00Z" }),
    ]);

    expect(index.get("a")?.map((task) => task.task_id)).toEqual(["新", "旧"]);
    expect(index.get("b")?.map((task) => task.task_id)).toEqual(["别人的"]);
    expect(index.get("从未提交")).toBeUndefined();
  });

  it("时间无法解析时不打乱既有顺序", () => {
    const index = indexTasksByDraft([
      taskOf("a", { task_id: "先", created_at: "不是时间" }),
      taskOf("a", { task_id: "后", created_at: "也不是时间" }),
    ]);

    expect(index.get("a")?.map((task) => task.task_id)).toEqual(["先", "后"]);
  });
});

describe("草稿的派生状态", () => {
  it("从未提交的草稿不带任何发布状态", () => {
    const summary = draftSummary(draftOf("a"), undefined);

    expect(summary).toMatchObject({ stage: "unsubmitted", total: 0, attention: 0 });
    expect(draftStageLabel(summary)).toBe("");
  });

  it("卡住的旧任务优先于最近一次的成功", () => {
    const summary = draftSummary(draftOf("a"), [
      taskOf("a", { status: "published", created_at: "2026-03-01T00:00:00Z" }),
      taskOf("a", { status: "needs_review", created_at: "2026-01-01T00:00:00Z" }),
    ]);

    expect(summary.stage).toBe("attention");
    expect(summary.attention).toBe(1);
    expect(summary.total).toBe(2);
  });

  it("取消掉的最近一次既不算已发布也不算没提交过", () => {
    expect(draftSummary(draftOf("a"), [taskOf("a", { status: "canceled" })]).stage).toBe("closed");
    expect(draftSummary(draftOf("a"), [taskOf("a", { status: "filling" })]).stage).toBe("running");
  });

  it("徽标只说最近一次发布，改过稿就直说", () => {
    const draft = draftOf("a", { content_fingerprint: CONTENT });
    const published = taskOf("a", { status: "published", package_fingerprint: CONTENT });

    expect(draftStageLabel(draftSummary(draft, [published]))).toBe("最近一次发布：已发布");
    expect(
      draftStageLabel(draftSummary(draft, [{ ...published, package_fingerprint: "d".repeat(64) }])),
    ).toBe("最近一次发布：已发布 · 内容已改动");
  });

  it("服务端没给可比的内容摘要时不乱标改动", () => {
    const draft = draftOf("a", { content_fingerprint: undefined });
    const summary = draftSummary(draft, [taskOf("a", { package_fingerprint: "d".repeat(64) })]);

    expect(summary.drifted).toBe(false);
  });

  it("一次算完整份列表的派生信息", () => {
    const summaries = summarizeDrafts(
      [draftOf("a"), draftOf("b")],
      [taskOf("a", { status: "published" })],
    );

    expect(summaries.get("a")?.stage).toBe("published");
    expect(summaries.get("b")?.stage).toBe("unsubmitted");
  });
});

describe("任务排序与统计", () => {
  it("等你处理的排在前面，同组内保持服务端顺序", () => {
    const ordered = orderTasksByAttention([
      taskOf("a", { task_id: "进行中", status: "publishing" }),
      taskOf("a", { task_id: "失败", status: "failed" }),
      taskOf("a", { task_id: "已发布", status: "published" }),
      taskOf("a", { task_id: "待确认", status: "needs_review" }),
    ]);

    expect(ordered.map((task) => task.task_id)).toEqual(["失败", "待确认", "进行中", "已发布"]);
  });

  it("角标只数真正等着用户的那些", () => {
    expect(
      attentionTaskCount([
        taskOf("a", { status: "failed" }),
        taskOf("a", { status: "awaiting_verification" }),
        taskOf("a", { status: "publishing" }),
        taskOf("a", { status: "published" }),
      ]),
    ).toBe(2);
  });
});

describe("草稿列表的显示与筛选", () => {
  it("没有标题就退到正文，正文也没有才叫未命名", () => {
    expect(draftTitle(draftOf("a", { title: " 正式标题 " }))).toBe("正式标题");
    expect(draftTitle(draftOf("a", { title: "", body: "短正文" }))).toBe("短正文");
    expect(draftTitle(draftOf("a", { title: "", body: "一".repeat(30) }))).toBe(
      `${"一".repeat(20)}…`,
    );
    expect(draftTitle(draftOf("a", { title: "", body: "   " }))).toBe("未命名草稿");
  });

  it("关键词同时覆盖标题、正文和标签", () => {
    const drafts = [
      draftOf("a", { title: "露营装备", body: "", tags: [] }),
      draftOf("b", { title: "", body: "周末去了海边", tags: [] }),
      draftOf("c", { title: "", body: "", tags: ["咖啡"] }),
    ];
    const summaries = summarizeDrafts(drafts, []);
    const pick = (keyword: string) =>
      filterDrafts(drafts, summaries, { keyword, stage: "all" }).map((draft) => draft.draft_id);

    expect(pick("露营")).toEqual(["a"]);
    expect(pick("海边")).toEqual(["b"]);
    expect(pick("咖啡")).toEqual(["c"]);
    expect(pick("  ")).toEqual(["a", "b", "c"]);
  });

  it("状态筛选按派生状态分档", () => {
    const drafts = [draftOf("a"), draftOf("b")];
    const summaries = summarizeDrafts(drafts, [taskOf("a", { status: "failed" })]);

    expect(
      filterDrafts(drafts, summaries, { keyword: "", stage: "attention" }).map((d) => d.draft_id),
    ).toEqual(["a"]);
    expect(
      filterDrafts(drafts, summaries, { keyword: "", stage: "unsubmitted" }).map((d) => d.draft_id),
    ).toEqual(["b"]);
  });
});
