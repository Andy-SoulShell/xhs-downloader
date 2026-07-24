import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  RotateCcw,
  X,
} from "lucide-react";

import type {
  PublicationTask,
  PublicationTaskStatus,
} from "../lib/publication";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { EmptyState } from "./empty-state";

export function PublicationTaskList({
  tasks,
  onCancel,
  onRetry,
}: {
  tasks: PublicationTask[];
  onCancel: (taskId: string) => Promise<void>;
  onRetry: (taskId: string) => Promise<void>;
}) {
  return (
    <section
      aria-label="发布任务"
      className="control-shell min-w-0 self-start p-4 xl:sticky xl:top-8"
    >
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-base font-semibold text-stone-900">发布任务</h2>
          <p className="mt-1 text-xs text-stone-500">
            自动刷新执行进度与待确认状态
          </p>
        </div>
        <Badge size="regular">{tasks.length} 条</Badge>
      </div>
      {tasks.length ? (
        <div className="mt-4 max-h-[720px] space-y-2 overflow-y-auto pr-1">
          {tasks.map((task) => (
            <TaskRow
              key={task.task_id}
              onCancel={() => void onCancel(task.task_id)}
              onRetry={() => void onRetry(task.task_id)}
              task={task}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            compact
            description="保存草稿后，可选择立即发布或指定计划时间。"
            icon={CalendarClock}
            title="还没有发布任务"
          />
        </div>
      )}
    </section>
  );
}

function TaskRow({
  task,
  onCancel,
  onRetry,
}: {
  task: PublicationTask;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const cancelable = ["scheduled", "ready"].includes(task.status);
  const retryable = ["failed", "needs_review"].includes(task.status);
  const manualReady = task.mode === "manual" && task.status === "ready";
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900">
            {task.package.title || "未命名发布"}
          </p>
          <p className="mt-1 text-[11px] text-stone-400">
            {task.mode === "scheduled" ? "定时" : "手动"} ·{" "}
            {formatTime(task.scheduled_at)}
          </p>
        </div>
        <TaskBadge status={task.status} />
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">{task.message}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-stone-400">
          尝试 {task.attempts} 次
        </span>
        <div className="flex items-center gap-1">
          {task.result_url && (
            <a
              className="inline-flex h-9 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-stone-600 hover:bg-stone-100"
              href={task.result_url}
              rel="noreferrer"
              target="_blank"
            >
              查看
              <ExternalLink aria-hidden size={13} />
            </a>
          )}
          {manualReady && (
            <a
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 hover:border-stone-400"
              href={creatorUrl(task.task_id)}
              rel="noreferrer"
              target="_blank"
            >
              打开创作页
              <ExternalLink aria-hidden size={13} />
            </a>
          )}
          {retryable && (
            <ActionButton onClick={onRetry} variant="outline">
              <RotateCcw aria-hidden size={13} />
              重试
            </ActionButton>
          )}
          {cancelable && (
            <ActionButton onClick={onCancel} variant="ghost">
              <X aria-hidden size={13} />
              取消
            </ActionButton>
          )}
        </div>
      </div>
    </article>
  );
}

function TaskBadge({ status }: { status: PublicationTaskStatus }) {
  const values = {
    scheduled: ["已排期", "warning", CalendarClock],
    ready: ["等待扩展", "warning", CalendarClock],
    claimed: ["已领取", "accent", CalendarClock],
    filling: ["正在填写", "accent", RotateCcw],
    publishing: ["正在发布", "accent", RotateCcw],
    published: ["已发布", "success", CheckCircle2],
    needs_review: ["待确认", "warning", CircleAlert],
    failed: ["失败", "danger", CircleAlert],
    canceled: ["已取消", "neutral", X],
  } as const;
  const [label, tone, Icon] = values[status];
  return (
    <Badge
      icon={Icon}
      size="regular"
      spinning={["filling", "publishing"].includes(status)}
      tone={tone}
    >
      {label}
    </Badge>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function creatorUrl(taskId: string): string {
  const url = new URL("https://creator.xiaohongshu.com/publish/publish");
  url.searchParams.set("xhd_task", taskId);
  return url.toString();
}
