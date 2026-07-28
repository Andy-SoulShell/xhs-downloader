import type { PublicationDraft, PublicationTask, PublicationTaskStatus } from "./publication";
import { publishStatusCopy } from "./terminology";

/**
 * 草稿与发布任务之间的派生视图。
 *
 * 草稿本身没有状态，也不该有：一份草稿可以产出多个任务，状态属于任务。
 * 这里按 `task.package.draft_id` 这条后端已有的外键把两者连起来，界面才能
 * 回答"这篇发出去了没有""哪一篇还等着我处理"。
 */

/** 停在这些状态的任务必须由用户亲自处理，否则永远不会继续。 */
const ATTENTION_STATUSES: readonly PublicationTaskStatus[] = [
  "awaiting_verification",
  "needs_review",
  "failed",
];

/** 这些状态会自行推进，用户只需要等。 */
const RUNNING_STATUSES: readonly PublicationTaskStatus[] = [
  "scheduled",
  "ready",
  "claimed",
  "filling",
  "publishing",
];

/** 正文降级为标题时截取的字数。 */
const BODY_TITLE_LENGTH = 20;

/**
 * 草稿在发布链路上的位置。
 *
 * `closed` 指最近一次提交已经取消：它既不是"还没发过"，也不是"已发布"，
 * 归进任何一档都是在替用户下结论。
 */
type DraftStage = "unsubmitted" | "running" | "attention" | "published" | "closed";

/** 左栏筛选条的取值，`all` 表示不筛。 */
export type DraftStageFilter = DraftStage | "all";

export interface DraftSummary {
  stage: DraftStage;
  /** 卡在等你处理的任务数。 */
  attention: number;
  /** 这份草稿一共提交过几次。 */
  total: number;
  /** 最近一次提交的任务；从未提交时为空。 */
  latest?: PublicationTask;
  /** 最近一次提交冻结的内容与现在的草稿已经不是一回事。 */
  drifted: boolean;
}

/**
 * 按源草稿归拢发布任务。
 *
 * @param tasks 发布任务列表。
 * @returns 草稿标识到该草稿任务的映射，每组按提交时间从新到旧。
 */
export function indexTasksByDraft(tasks: PublicationTask[]): Map<string, PublicationTask[]> {
  const index = new Map<string, PublicationTask[]>();
  for (const task of tasks) {
    const group = index.get(task.package.draft_id);
    if (group) group.push(task);
    else index.set(task.package.draft_id, [task]);
  }
  for (const group of index.values()) {
    group.sort((left, right) => instant(right.created_at) - instant(left.created_at));
  }
  return index;
}

/**
 * 归纳一份草稿的发布情况。
 *
 * @param draft 草稿本体。
 * @param tasks 该草稿的任务，需按提交时间从新到旧，即 {@link indexTasksByDraft} 的输出。
 * @returns 供卡片徽标与筛选使用的派生信息。
 */
export function draftSummary(draft: PublicationDraft, tasks: PublicationTask[] = []): DraftSummary {
  const attention = tasks.filter((task) => ATTENTION_STATUSES.includes(task.status)).length;
  const [latest] = tasks;
  return {
    stage: draftStage(latest, attention),
    attention,
    total: tasks.length,
    latest,
    // 老版本服务端不下发 content_fingerprint，缺了就没有可比的东西；
    // 此时宁可什么都不说，也不能把每一篇都标成"内容已改动"。
    drifted: Boolean(
      latest &&
      draft.content_fingerprint &&
      latest.package_fingerprint !== draft.content_fingerprint,
    ),
  };
}

/**
 * 一次算完整份草稿列表的派生信息。
 *
 * @param drafts 草稿列表。
 * @param tasks 全部发布任务。
 * @returns 草稿标识到派生信息的映射。
 */
export function summarizeDrafts(
  drafts: PublicationDraft[],
  tasks: PublicationTask[],
): Map<string, DraftSummary> {
  const index = indexTasksByDraft(tasks);
  return new Map(
    drafts.map((draft) => [draft.draft_id, draftSummary(draft, index.get(draft.draft_id))]),
  );
}

/**
 * 把等着用户处理的任务提到最前。
 *
 * 同组内保持服务端顺序：轮询整份替换列表，再排一次只会让卡片跳来跳去。
 *
 * @param tasks 发布任务列表。
 * @returns 需要处理的在前、其余在后的新数组。
 */
export function orderTasksByAttention(tasks: PublicationTask[]): PublicationTask[] {
  const waiting = tasks.filter((task) => ATTENTION_STATUSES.includes(task.status));
  const rest = tasks.filter((task) => !ATTENTION_STATUSES.includes(task.status));
  return [...waiting, ...rest];
}

/**
 * 统计等着用户处理的发布任务数，用于侧栏角标。
 *
 * @param tasks 发布任务列表。
 * @returns 需要用户处理的任务数。
 */
export function attentionTaskCount(tasks: PublicationTask[]): number {
  return tasks.filter((task) => ATTENTION_STATUSES.includes(task.status)).length;
}

/**
 * 草稿在列表里的显示名。
 *
 * 标题可以为空，正文也可以为空，但列表里的每一行都得有个能读的名字。
 *
 * @param draft 草稿本体。
 * @returns 标题、正文开头或"未命名草稿"。
 */
export function draftTitle(draft: PublicationDraft): string {
  const title = draft.title.trim();
  if (title) return title;
  const body = draft.body.trim().replace(/\s+/g, " ");
  if (body) {
    return body.length > BODY_TITLE_LENGTH ? `${body.slice(0, BODY_TITLE_LENGTH)}…` : body;
  }
  return "未命名草稿";
}

/**
 * 草稿卡片上的发布徽标文案。
 *
 * 固定写成"最近一次发布：…"。写成"已发布"就是在替快照说话——周一发出去、
 * 周二改了稿，草稿和那次发出去的内容早就不是一回事了。
 *
 * @param summary 草稿的派生信息。
 * @returns 徽标文案；从未提交过时为空字符串。
 */
export function draftStageLabel(summary: DraftSummary): string {
  if (!summary.latest) return "";
  const label = `最近一次发布：${publishStatusCopy[summary.latest.status].label}`;
  return summary.drifted ? `${label} · 内容已改动` : label;
}

/**
 * 按关键词和状态筛选草稿。
 *
 * 关键词只在已经取回的这批草稿里找：服务端没有搜索端点，界面不能假装有。
 *
 * @param drafts 草稿列表。
 * @param summaries {@link summarizeDrafts} 的输出。
 * @param filter 关键词与状态档。
 * @returns 命中的草稿，保持原有顺序。
 */
export function filterDrafts(
  drafts: PublicationDraft[],
  summaries: Map<string, DraftSummary>,
  filter: { keyword: string; stage: DraftStageFilter },
): PublicationDraft[] {
  const keyword = filter.keyword.trim().toLowerCase();
  return drafts.filter((draft) => {
    const stage = summaries.get(draft.draft_id)?.stage ?? "unsubmitted";
    if (filter.stage !== "all" && stage !== filter.stage) return false;
    if (!keyword) return true;
    return [draft.title, draft.body, ...draft.tags].some((text) =>
      text.toLowerCase().includes(keyword),
    );
  });
}

function draftStage(latest: PublicationTask | undefined, attention: number): DraftStage {
  if (!latest) return "unsubmitted";
  // 旧任务卡住时最近一次可能已经发成功了，但卡住的那条仍然等着人处理，
  // 所以"需要你处理"优先于最近一次的状态。
  if (attention) return "attention";
  if (RUNNING_STATUSES.includes(latest.status)) return "running";
  return latest.status === "published" ? "published" : "closed";
}

function instant(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
