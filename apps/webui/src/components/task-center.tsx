import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  MonitorDown,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  formatFullTime,
  formatRelativeTime,
} from "../lib/format-time";
import { downloadStatusCopy, humanizeError } from "../lib/terminology";
import type {
  ClientDownloadRecord,
  DownloadTask,
  DownloadTaskStatus,
} from "../lib/types";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { EmptyState } from "./empty-state";

export function TaskBoard({
  tasks,
  onRetry,
}: {
  tasks: DownloadTask[];
  onRetry: (taskId: string) => void;
}) {
  return (
    <ManagementSection
      description="下载在后台进行，关掉这个页面也不会中断。"
      title="下载"
    >
      {tasks.length ? (
        <div className="space-y-3">
          {tasks.map((task) => (
            <article
              className="record-card group flex items-start gap-3.5 transition-[border-color,box-shadow] duration-200 hover:border-stone-300 hover:shadow-[0_1px_2px_rgb(28_25_23/0.04),0_8px_24px_rgb(28_25_23/0.06)]"
              key={task.task_id}
            >
              <TaskStatusIcon status={task.status} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-3">
                  {/* 状态紧跟标题：推到行尾会让视线横跨整屏才能对应。 */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <h2 className="truncate text-sm leading-6 font-semibold text-stone-900">
                      {task.detail?.作品标题 || workId(task.source_url)}
                    </h2>
                    <StatusBadge status={task.status} />
                  </div>
                  {/* 恢复操作常驻：藏在悬停后会让用户找不到出路。 */}
                  {task.status === "failed" && (
                    <ActionButton
                      className="ml-auto shrink-0"
                      onClick={() => onRetry(task.task_id)}
                      variant="outline"
                    >
                      <RotateCcw
                        aria-hidden
                        className="transition-transform duration-300 group-hover:-rotate-180"
                        size={14}
                      />
                      重新下载
                    </ActionButton>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-5 text-stone-500">
                  {humanizeError(task.message)}
                </p>
                {downloadStatusCopy[task.status].hint && (
                  <p className="mt-1.5 text-xs leading-5 text-amber-700">
                    {downloadStatusCopy[task.status].hint}
                  </p>
                )}
                <p className="meta-text mt-2 flex flex-wrap items-center gap-x-2">
                  <time dateTime={task.updated_at} title={formatFullTime(task.updated_at)}>
                    {formatRelativeTime(task.updated_at)}
                  </time>
                  {task.attempts > 1 && (
                    <>
                      <Dot />第 {task.attempts} 次尝试
                    </>
                  )}
                  <Dot />
                  {task.media_indexes.length
                    ? `${task.media_indexes.length} 张图片或视频`
                    : "全部图片和视频"}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="下载开始后可以在这里看到进度。"
          icon={MonitorDown}
          title="还没有下载记录"
        />
      )}
    </ManagementSection>
  );
}

export function RecordBoard({
  records,
}: {
  records: ClientDownloadRecord[];
}) {
  return (
    <ManagementSection
      description="这些是浏览器插件直接下载的，在插件面板里点同步后出现在这里。"
      title="插件下载"
    >
      {records.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {records.map((record) => (
            <article
              className="record-card transition-[border-color,box-shadow] duration-200 hover:border-stone-300 hover:shadow-[0_1px_2px_rgb(28_25_23/0.04),0_8px_24px_rgb(28_25_23/0.06)]"
              key={record.record_id}
            >
              <div className="flex items-center gap-2.5">
                <h2 className="min-w-0 truncate text-sm leading-6 font-semibold text-stone-900">
                  {record.title || record.work_id}
                </h2>
                <Badge
                  size="regular"
                  tone={record.status === "completed" ? "success" : "danger"}
                >
                  {record.status === "completed"
                    ? downloadStatusCopy.completed.label
                    : downloadStatusCopy.failed.label}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                {humanizeError(record.message)}
              </p>
              <p className="meta-text mt-2.5 flex flex-wrap items-center gap-x-2">
                <time
                  dateTime={record.created_at}
                  title={formatFullTime(record.created_at)}
                >
                  {formatRelativeTime(record.created_at)}
                </time>
                <Dot />
                {record.media_indexes.length} 张图片或视频
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="用浏览器插件直接下载后，在插件面板里点一下同步就会显示在这里。"
          icon={MonitorDown}
          title="还没有插件下载记录"
        />
      )}
    </ManagementSection>
  );
}

/**
 * 分区内容容器。
 *
 * 标签条已经承担了标题与计数，这里只保留一行说明；再放一个同名大标题
 * 会让同一件事在一屏内出现三次。
 */
function ManagementSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section aria-label={title}>
      <p className="mb-4 text-xs leading-5 text-stone-500">{description}</p>
      {children}
    </section>
  );
}

function TaskStatusIcon({ status }: { status: DownloadTaskStatus }) {
  const styles = {
    queued: ["bg-amber-50 text-amber-600", Clock3],
    running: ["bg-blue-50 text-blue-600", RefreshCw],
    completed: ["bg-emerald-50 text-emerald-600", CheckCircle2],
    failed: ["bg-red-50 text-red-600", CircleAlert],
  } as const;
  const [className, Icon] = styles[status];
  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${className}`}>
      <Icon aria-hidden className={status === "running" ? "animate-spin" : ""} size={17} />
    </span>
  );
}

function StatusBadge({ status }: { status: DownloadTaskStatus }) {
  const tones = {
    queued: "warning",
    running: "accent",
    completed: "success",
    failed: "danger",
  } as const;
  return <Badge tone={tones[status]}>{downloadStatusCopy[status].label}</Badge>;
}

function workId(value: string): string {
  return value.split("?")[0].split("/").filter(Boolean).at(-1) || "未命名帖子";
}

/** 元信息之间的分隔点；比顿号更轻，不打断扫读。 */
function Dot() {
  return <span aria-hidden className="text-stone-300">·</span>;
}
