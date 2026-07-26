import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  MonitorDown,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { ReactNode } from "react";

import { downloadStatusCopy, humanizeError } from "../lib/terminology";
import type {
  ClientDownloadRecord,
  DownloadTask,
  DownloadTaskStatus,
} from "../lib/types";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { EmptyState } from "./empty-state";
import { PageHeading } from "./page-heading";

export function TaskBoard({
  tasks,
  onRetry,
}: {
  tasks: DownloadTask[];
  onRetry: (taskId: string) => void;
}) {
  return (
    <ManagementSection
      count={tasks.length}
      description="下载在后台进行，关掉这个页面也不会中断。"
      title="下载"
    >
      {tasks.length ? (
        <div className="space-y-3">
          {tasks.map((task) => (
            <article
              className="record-card flex flex-col gap-4 sm:flex-row sm:items-start"
              key={task.task_id}
            >
              <TaskStatusIcon status={task.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-stone-900">
                    {task.detail?.作品标题 || workId(task.source_url)}
                  </h2>
                  <StatusBadge status={task.status} />
                </div>
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  {humanizeError(task.message)}
                </p>
                {downloadStatusCopy[task.status].hint && (
                  <p className="mt-1 text-xs leading-5 text-amber-700">
                    {downloadStatusCopy[task.status].hint}
                  </p>
                )}
                <p className="meta-text mt-2">
                  {formatTime(task.updated_at)}
                  {task.attempts > 1 ? ` · 第 ${task.attempts} 次尝试` : ""}
                  {task.media_indexes.length
                    ? ` · ${task.media_indexes.length} 张图片或视频`
                    : " · 全部图片和视频"}
                </p>
              </div>
              {task.status === "failed" && (
                <ActionButton
                  onClick={() => onRetry(task.task_id)}
                  variant="outline"
                >
                  <RotateCcw aria-hidden size={14} />
                  重新下载
                </ActionButton>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="下载开始后可以在这里看到进度。"
          icon={RefreshCw}
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
      count={records.length}
      description="这些是浏览器插件直接下载的，在插件面板里点同步后出现在这里。"
      title="插件下载"
    >
      {records.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {records.map((record) => (
            <article
              className="record-card"
              key={record.record_id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-stone-900">
                    {record.title || record.work_id}
                  </h2>
                  <p className="mt-1 text-xs text-stone-500">
                    {record.mode === "browser" ? "浏览器直接下载" : "本机下载"} ·{" "}
                    {record.media_indexes.length} 张图片或视频
                  </p>
                </div>
                <Badge
                  size="regular"
                  tone={record.status === "completed" ? "success" : "danger"}
                >
                  {record.status === "completed"
                    ? downloadStatusCopy.completed.label
                    : downloadStatusCopy.failed.label}
                </Badge>
              </div>
              <p className="mt-4 line-clamp-2 text-xs leading-5 text-stone-500">
                {humanizeError(record.message)}
              </p>
              <p className="mt-3 text-[11px] text-stone-400">
                {formatTime(record.created_at)}
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

function ManagementSection({
  children,
  count,
  description,
  title,
}: {
  children: ReactNode;
  count: number;
  description: string;
  title: string;
}) {
  return (
    <section className="mt-8" aria-label={title}>
      <PageHeading
        description={description}
        meta={`${count} 条`}
        title={title}
      />
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

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
