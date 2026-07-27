import type { BrowserTask } from "@xhs-downloader/contracts";

/** 相邻且完全同义的浏览操作合成的一组。 */
export interface BrowserTaskGroup {
  /** 代表项，取组内最新的那条；重试与确认都作用在它身上。 */
  task: BrowserTask;
  /** 组内条数；为 1 时与合并前完全一致。 */
  count: number;
  /** 组内最早一条的时间；只有一条时与代表项相同。 */
  earliestAt: string;
}

/**
 * 只有「需要你确认结果」不参与合并。
 *
 * 那种状态每一条都对应一次真实的平台写入，要一条一个结论，合成一行会让其余
 * 几条连同它们的确认按钮一起消失。失败可以合并：几条一模一样的失败对用户只是
 * 同一件事没成，重试作用在最新那条即可，其余只是历史。
 */
const MERGEABLE = (status: string): boolean => status !== "needs_review";

/**
 * 把相邻的重复浏览操作合成一条。
 *
 * 同一个动作连着重试或轮询会留下好几条一模一样的记录，此前列表一条不落地
 * 全铺出来，读起来像卡带，真正不同的那几条反而被淹掉。这里只合并**相邻**且
 * 各字段都相同的记录，时间顺序不会被打乱。
 *
 * @param tasks 按时间倒序排列的浏览操作。
 * @returns 合并后的分组，顺序与入参一致。
 */
export function groupBrowserTasks(tasks: BrowserTask[]): BrowserTaskGroup[] {
  const groups: BrowserTaskGroup[] = [];
  for (const task of tasks) {
    const previous = groups.at(-1);
    const sameAsPrevious =
      previous !== undefined &&
      MERGEABLE(previous.task.status) &&
      MERGEABLE(task.status) &&
      previous.task.kind === task.kind &&
      previous.task.status === task.status &&
      previous.task.target_driver === task.target_driver &&
      previous.task.message === task.message;
    if (sameAsPrevious) {
      previous.count += 1;
      // 入参按时间倒序，所以后来的每一条都更早。
      previous.earliestAt = task.updated_at;
      continue;
    }
    groups.push({ task, count: 1, earliestAt: task.updated_at });
  }
  return groups;
}
