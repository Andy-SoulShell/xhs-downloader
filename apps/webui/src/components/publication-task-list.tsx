import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";

import type { PublicationTask } from "../lib/publication";
import { connectionCopy, publishStatusCopy } from "../lib/terminology";
import type { BrowserDriver } from "../lib/types";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { EmptyState } from "./empty-state";
import { PublicationVerificationResume } from "./publication-verification-resume";

/** 展示发布任务状态，并提供与状态匹配的安全操作入口。 */
export function PublicationTaskList({
  tasks,
  onCancel,
  onResumeVerification,
  onReview,
  onRetry,
}: {
  tasks: PublicationTask[];
  onCancel: (taskId: string) => Promise<void>;
  onResumeVerification: (taskId: string) => Promise<void>;
  onReview: (taskId: string, published: boolean) => Promise<void>;
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
              onResumeVerification={() => onResumeVerification(task.task_id)}
              onReview={(published) => void onReview(task.task_id, published)}
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
  onResumeVerification,
  onReview,
  onRetry,
}: {
  task: PublicationTask;
  onCancel: () => void;
  onResumeVerification: () => Promise<void>;
  onReview: (published: boolean) => void;
  onRetry: () => void;
}) {
  const [reviewDecision, setReviewDecision] = useState<boolean | null>(null);
  const cancelable = ["scheduled", "ready"].includes(task.status);
  const retryable = task.status === "failed";
  const extensionReady =
    task.mode !== "scheduled" &&
    task.status === "ready" &&
    task.target_driver === "extension";
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900">
            {task.package.title || "未命名发布"}
          </p>
          <p className="mt-1 text-[11px] text-stone-400">
            {modeLabel(task.mode)} ·{" "}
            {formatTime(task.scheduled_at)}
          </p>
        </div>
        <TaskBadge task={task} />
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-500">{task.message}</p>
      {task.status === "awaiting_verification" &&
        task.target_driver === "managed" && (
          <PublicationVerificationResume onResume={onResumeVerification} />
        )}
      {task.status === "needs_review" && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] leading-5 text-amber-900">
            {publishStatusCopy.needs_review.hint}
          </p>
          {reviewDecision === null ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton
                onClick={() => setReviewDecision(true)}
                variant="outline"
              >
                发出去了
              </ActionButton>
              <ActionButton
                onClick={() => setReviewDecision(false)}
                variant="outline"
              >
                没发出去
              </ActionButton>
            </div>
          ) : (
            <div aria-label="确认发布结果" className="mt-2">
              <p className="text-xs font-semibold text-amber-950">
                {reviewDecision
                  ? "确认这篇已经发布成功？"
                  : "确认这篇没有发出去？确认后可以重新发布。"}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <ActionButton
                  onClick={() => setReviewDecision(null)}
                  variant="ghost"
                >
                  再看看
                </ActionButton>
                <ActionButton
                  onClick={() => {
                    onReview(reviewDecision);
                    setReviewDecision(null);
                  }}
                >
                  <ShieldCheck aria-hidden size={13} />
                  确认
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-stone-400">
          {driverLabel(task.target_driver)}
          {task.attempts > 1 ? ` · 第 ${task.attempts} 次尝试` : ""}
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
          {extensionReady && (
            <a
              className="inline-flex h-9 items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 hover:border-stone-400"
              href={creatorUrl(task)}
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

function TaskBadge({ task }: { task: PublicationTask }) {
  const presentation = {
    scheduled: ["warning", CalendarClock],
    ready: ["warning", CalendarClock],
    claimed: ["accent", CalendarClock],
    filling: ["accent", RotateCcw],
    publishing: ["accent", RotateCcw],
    awaiting_verification: ["warning", ShieldCheck],
    published: ["success", CheckCircle2],
    needs_review: ["warning", CircleAlert],
    failed: ["danger", CircleAlert],
    canceled: ["neutral", X],
  } as const;
  const [tone, Icon] = presentation[task.status];
  return (
    <Badge
      icon={Icon}
      size="regular"
      spinning={["filling", "publishing"].includes(task.status)}
      tone={tone}
    >
      {publishStatusCopy[task.status].label}
    </Badge>
  );
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function modeLabel(mode: PublicationTask["mode"]): string {
  if (mode === "scheduled") return "本地定时";
  if (mode === "platform_scheduled") return "官方定时";
  return "立即发布";
}

function driverLabel(driver: BrowserDriver): string {
  return connectionCopy[driver].label;
}

function creatorUrl(task: PublicationTask): string {
  const url = new URL("https://creator.xiaohongshu.com/publish/publish");
  url.searchParams.set("xhd_task", task.task_id);
  if (task.package.assets[0]?.media_type.startsWith("video/")) {
    url.searchParams.set("target", "video");
  }
  return url.toString();
}
