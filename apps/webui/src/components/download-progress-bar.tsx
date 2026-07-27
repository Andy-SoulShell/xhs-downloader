import { describeProgress } from "../lib/download-progress";
import type { DownloadProgress } from "../lib/types";

/**
 * 后台下载任务的进度条。
 *
 * 只在任务真正开始后出现：任务刚排队时显示一条 0% 的进度条，会让人
 * 误以为卡住了。宽度用 transform 缩放而非 width，避免每帧触发重排。
 *
 * @param props 组件属性。
 * @param props.progress 任务上报的实时进度。
 * @returns 带无障碍语义的进度条与说明文字；尚未开始时不渲染。
 */
export function DownloadProgressBar({ progress }: { progress: DownloadProgress }) {
  const view = describeProgress(progress);
  if (!view.started) return null;

  const percent = Math.round((view.ratio ?? 0) * 100);
  return (
    <div className="mt-2">
      <div
        aria-label="下载进度"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        aria-valuetext={view.label}
        className="h-1 w-full overflow-hidden rounded-full bg-stone-200/80"
        role="progressbar"
      >
        <span
          className="block h-full origin-left rounded-full bg-red-500 transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${view.ratio ?? 0})` }}
        />
      </div>
      <p className="meta-text mt-1.5 tabular-nums">{view.label}</p>
    </div>
  );
}
