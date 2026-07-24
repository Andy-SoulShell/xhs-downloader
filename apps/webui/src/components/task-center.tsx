import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  MonitorDown,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import type { ReactNode } from "react";

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
      description="后台任务由本地服务持久化执行，关闭管理页面不会中断。"
      title="下载任务"
    >
      {tasks.length ? (
        <div className="space-y-3">
          {tasks.map((task) => (
            <article
              className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center"
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
                <p className="mt-1 truncate text-xs text-stone-500">
                  {task.message}
                </p>
                <p className="mt-2 text-[11px] text-stone-400">
                  {formatTime(task.updated_at)} · 已尝试 {task.attempts} 次
                  {task.media_indexes.length
                    ? ` · ${task.media_indexes.length} 项媒体`
                    : " · 全部媒体"}
                </p>
              </div>
              {task.status === "failed" && (
                <ActionButton
                  onClick={() => onRetry(task.task_id)}
                  variant="outline"
                >
                  <RotateCcw aria-hidden size={14} />
                  重试
                </ActionButton>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="从帖子详情提交下载后，任务状态会显示在这里。"
          icon={RefreshCw}
          title="还没有后台下载任务"
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
      description="这里汇总浏览器独立模式显式同步到本地服务的下载记录。"
      title="独立下载记录"
    >
      {records.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {records.map((record) => (
            <article
              className="rounded-2xl border border-stone-200 bg-white p-5"
              key={record.record_id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-stone-900">
                    {record.title || record.work_id}
                  </h2>
                  <p className="mt-1 text-xs text-stone-500">
                    {record.mode === "browser" ? "浏览器下载" : "后台下载"} ·{" "}
                    {record.media_indexes.length} 项媒体
                  </p>
                </div>
                <Badge
                  size="regular"
                  tone={record.status === "completed" ? "success" : "danger"}
                >
                  {record.status === "completed" ? "完成" : "失败"}
                </Badge>
              </div>
              <p className="mt-4 line-clamp-2 text-xs leading-5 text-stone-500">
                {record.message}
              </p>
              <p className="mt-3 text-[11px] text-stone-400">
                {formatTime(record.created_at)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          description="浏览器独立下载完成后，可在扩展中将记录同步到这里。"
          icon={MonitorDown}
          title="还没有同步的独立下载记录"
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
  const labels = {
    queued: "排队中",
    running: "下载中",
    completed: "已完成",
    failed: "失败",
  };
  return (
    <Badge>
      {labels[status]}
    </Badge>
  );
}

function workId(value: string): string {
  return value.split("?")[0].split("/").filter(Boolean).at(-1) || "未知作品";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
