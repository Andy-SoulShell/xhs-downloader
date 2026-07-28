import {
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";

import { formatFullTime, formatRelativeTime } from "../../lib/format-time";
import type { PublicationTask } from "../../lib/publication";
import { publicationCreatorUrl } from "../../lib/publication-editor-rules";
import { connectionCopy, publishStatusCopy } from "../../lib/terminology";
import { ActionButton } from "../action-button";
import { Badge } from "../badge";
import { PublicationVerificationResume } from "./verification-resume";

interface PublicationTaskRowProps {
  task: PublicationTask;
  onCancel: () => void;
  onResumeVerification: () => Promise<void>;
  onReview: (published: boolean) => void;
  onRetry: () => void;
  /** 回到这次提交所用的草稿；已经在那份草稿里时不传。 */
  onOpenDraft?: () => void;
}

/**
 * 一次发布提交的卡片。
 *
 * 任务是不可变的快照，卡片上显示的是提交那一刻的内容，与草稿现在的样子
 * 可能已经不同——所以要留一条回到源草稿的路。
 */
export function PublicationTaskRow({
  task,
  onCancel,
  onResumeVerification,
  onReview,
  onRetry,
  onOpenDraft,
}: PublicationTaskRowProps) {
  const [reviewDecision, setReviewDecision] = useState<boolean | null>(null);
  const cancelable = ["scheduled", "ready"].includes(task.status);
  const retryable = task.status === "failed";
  const extensionReady =
    task.mode !== "scheduled" && task.status === "ready" && task.target_driver === "extension";
  const planned = task.mode !== "manual";
  const stamp = planned ? task.scheduled_at : task.created_at;
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900">
            {task.package.title || "未命名发布"}
          </p>
          <p className="meta-text mt-1">
            {modeLabel(task.mode)} ·{" "}
            <time dateTime={stamp} title={formatFullTime(stamp)}>
              {planned ? formatFullTime(stamp) : formatRelativeTime(stamp)}
            </time>
          </p>
        </div>
        <TaskBadge task={task} />
      </div>
      <p className="mt-3 text-xs leading-5 text-stone-600">{task.message}</p>
      {task.status === "awaiting_verification" && task.target_driver === "managed" && (
        <PublicationVerificationResume onResume={onResumeVerification} />
      )}
      {task.status === "needs_review" && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[11px] leading-5 text-amber-900">
            {publishStatusCopy.needs_review.hint}
          </p>
          {reviewDecision === null ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton onClick={() => setReviewDecision(true)} variant="outline">
                发出去了
              </ActionButton>
              <ActionButton onClick={() => setReviewDecision(false)} variant="outline">
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
                <ActionButton onClick={() => setReviewDecision(null)} variant="ghost">
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
        <span className="meta-text">
          {connectionCopy[task.target_driver].label}
          {task.attempts > 1 ? ` · 第 ${task.attempts} 次尝试` : ""}
        </span>
        <div className="flex items-center gap-1">
          {onOpenDraft && (
            <ActionButton onClick={onOpenDraft} variant="ghost">
              <FileText aria-hidden size={13} />
              查看源草稿
            </ActionButton>
          )}
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
              href={publicationCreatorUrl(task)}
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

function modeLabel(mode: PublicationTask["mode"]): string {
  if (mode === "scheduled") return "本地定时";
  if (mode === "platform_scheduled") return "官方定时";
  return "立即发布";
}
