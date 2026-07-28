import type { DownloadTask } from "./types";

/** 一条刚刚落定的任务。 */
interface SettledTask {
  taskId: string;
  title: string;
  settledAs: "completed" | "failed";
}

const ACTIVE = new Set(["queued", "running"]);
const SETTLED = new Set(["completed", "failed"]);

/**
 * 找出在两次轮询之间刚刚落定的任务。
 *
 * 只认"上一轮还在跑、这一轮已结束"的跃迁。页面打开前就完成的任务不该补一条
 * 通知，否则每次刷新都会把历史结果重播一遍。
 *
 * @param previous 上一次轮询得到的任务列表。
 * @param next 本次轮询得到的任务列表。
 * @returns 本次新落定的任务，按传入顺序排列。
 */
export function detectSettledTasks(previous: DownloadTask[], next: DownloadTask[]): SettledTask[] {
  if (!previous.length) return [];
  const before = new Map(previous.map((task) => [task.task_id, task.status]));
  const settled: SettledTask[] = [];
  for (const task of next) {
    const was = before.get(task.task_id);
    if (!was || !ACTIVE.has(was) || !SETTLED.has(task.status)) continue;
    settled.push({
      taskId: task.task_id,
      title: task.detail?.作品标题 || "未命名帖子",
      settledAs: task.status as "completed" | "failed",
    });
  }
  return settled;
}

/**
 * 把落定结果整理成一句提示。
 *
 * @param settled 本次落定的任务。
 * @returns 提示正文与语气；没有落定任务时返回 null。
 */
export function describeSettled(
  settled: SettledTask[],
): { message: string; tone: "success" | "error" } | null {
  if (!settled.length) return null;
  const failed = settled.filter((task) => task.settledAs === "failed");
  const done = settled.filter((task) => task.settledAs === "completed");
  if (failed.length && !done.length) {
    return {
      message:
        failed.length === 1
          ? `「${failed[0].title}」下载失败，可以在动态里重试`
          : `${failed.length} 个下载失败，可以在动态里重试`,
      tone: "error",
    };
  }
  if (failed.length) {
    return {
      message: `${done.length} 个下载完成，${failed.length} 个失败`,
      tone: "error",
    };
  }
  return {
    message: done.length === 1 ? `「${done[0].title}」下载完成` : `${done.length} 个下载完成`,
    tone: "success",
  };
}
