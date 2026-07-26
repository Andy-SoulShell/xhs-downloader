import {
  appendDownloadBatch,
  loadDownloadBatches,
  removeDownloadBatches,
} from "./storage";
import type { BrowserDownloadBatch, ClientDownloadRecord } from "./types";

/** 一批浏览器下载的最终结果。 */
export interface BrowserDownloadOutcome {
  batch: BrowserDownloadBatch;
  status: ClientDownloadRecord["status"];
  message: string;
}

/**
 * 判断一批下载是否已全部结束，并给出结果。
 *
 * 浏览器把取消、磁盘错误和服务端拒绝都归为 `interrupted`；只要其中
 * 一个文件没有落盘，整批就记为失败，避免把未完成的下载记成成功。
 * 查不到的下载项按已被移除处理，同样不能算成功。
 *
 * @param batch 待确认的下载批次。
 * @param items 浏览器返回的下载项，缺失表示记录已被移除。
 * @returns 全部结束时返回结果；仍有文件在下载时返回 `null`。
 */
export function resolveBatchOutcome(
  batch: BrowserDownloadBatch,
  items: (chrome.downloads.DownloadItem | undefined)[],
): BrowserDownloadOutcome | null {
  if (items.some((item) => item?.state === "in_progress")) return null;
  const missing = items.filter((item) => item === undefined).length;
  const interrupted = items.filter(
    (item) => item?.state === "interrupted",
  ).length;
  const total = batch.download_ids.length;
  if (!missing && !interrupted) {
    return {
      batch,
      status: "completed",
      message: `浏览器已下载 ${total} 个文件`,
    };
  }
  const failed = missing + interrupted;
  const reason = items.find((item) => item?.state === "interrupted")?.error;
  const detail = reason ? `，原因 ${reason}` : "";
  return {
    batch,
    status: "failed",
    message: `浏览器下载未完成：${failed}/${total} 个文件失败${detail}`,
  };
}

/** 登记一批已交给浏览器、等待确认结果的下载。 */
export async function trackDownloadBatch(
  batch: BrowserDownloadBatch,
): Promise<void> {
  await appendDownloadBatch(batch);
}

/**
 * 向浏览器补查所有待确认批次，返回本次新确定结果的批次。
 *
 * 已确定结果的批次会从持久化状态中移除，因此同一批次只会返回一次。
 */
export async function settleDownloadBatches(): Promise<
  BrowserDownloadOutcome[]
> {
  const batches = await loadDownloadBatches();
  if (!batches.length) return [];
  const outcomes: BrowserDownloadOutcome[] = [];
  for (const batch of batches) {
    const items = await Promise.all(
      batch.download_ids.map((id) => findDownloadItem(id)),
    );
    const outcome = resolveBatchOutcome(batch, items);
    if (outcome) outcomes.push(outcome);
  }
  if (outcomes.length) {
    await removeDownloadBatches(outcomes.map((item) => item.batch.batch_id));
  }
  return outcomes;
}

/**
 * 监听浏览器下载状态变化并在批次结束时回调。
 *
 * 监听器必须在顶层注册，Service Worker 被唤醒时才能继续接收事件；
 * 启动时先对账一次，覆盖休眠期间已经结束的下载。
 *
 * @param onSettled 处理已确定结果批次的回调。
 */
export function installDownloadTracking(
  onSettled: (outcomes: BrowserDownloadOutcome[]) => Promise<void>,
): void {
  const settle = async (): Promise<void> => {
    const outcomes = await settleDownloadBatches();
    if (outcomes.length) await onSettled(outcomes);
  };
  chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state || delta.error) void settle();
  });
  void settle();
}

async function findDownloadItem(
  id: number,
): Promise<chrome.downloads.DownloadItem | undefined> {
  try {
    const items = await chrome.downloads.search({ id });
    return items[0];
  } catch {
    return undefined;
  }
}
