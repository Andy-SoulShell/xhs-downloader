import type { DownloadProgress } from "./types";

interface ProgressView {
  /** 0 到 1 之间的完成比例；无法确定时为 null，界面据此改用不确定态。 */
  ratio: number | null;
  /** 主文案，例如“正在下载 2/5 · 12.4 MB / 30.1 MB”。 */
  label: string;
  /** 是否已经开始，用于决定要不要显示进度条。 */
  started: boolean;
}

const UNITS = ["B", "KB", "MB", "GB"];

/**
 * 把字节数格式化为便于扫读的容量。
 *
 * @param value 字节数。
 * @returns 例如“12.4 MB”；小于 1 KB 时保留整数字节。
 */
export function formatBytes(value: number): string {
  if (value <= 0) return "0 B";
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(size) : size.toFixed(1)} ${UNITS[unit]}`;
}

/**
 * 把进度数据整理成可直接展示的视图。
 *
 * 上游不一定给出 `Content-Length`。这种情况下编造百分比会让进度条走到一半
 * 卡住或倒退，比没有进度更糟；此时只报文件计数，由界面改用不确定态。
 *
 * @param progress 后台任务上报的进度。
 * @returns 完成比例、主文案与是否已开始。
 */
export function describeProgress(progress: DownloadProgress): ProgressView {
  const { completed_files, total_files, received_bytes, total_bytes } = progress;
  const started = total_files > 0;
  if (!started) {
    return { ratio: null, label: "正在准备下载", started: false };
  }

  const counted = `${Math.min(completed_files + 1, total_files)}/${total_files}`;
  if (total_bytes <= 0) {
    // 只有文件计数可用时，已完成的文件数就是唯一可靠的比例来源。
    return {
      ratio: completed_files / total_files,
      label: `正在下载第 ${counted} 个文件`,
      started: true,
    };
  }

  const ratio = Math.min(1, received_bytes / total_bytes);
  return {
    ratio,
    label: `正在下载 ${counted} · ${formatBytes(received_bytes)} / ${formatBytes(total_bytes)}`,
    started: true,
  };
}
