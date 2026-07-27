import { Check, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import type {
  BrowserDriver,
  BrowserTask,
  BrowserTaskKind,
} from "@xhs-downloader/contracts";

import {
  formatFullTime,
  formatRelativeTime,
} from "../lib/format-time";
import {
  browseStatusCopy,
  connectionCopy,
  humanizeError,
  type BrowseStatusKey,
} from "../lib/terminology";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { BrowserTaskDiagnostics } from "./browser-task-diagnostics";

const KIND_LABELS: Record<BrowserTaskKind, string> = {
  check_login_status: "检查登录状态",
  get_login_qrcode: "获取登录二维码",
  delete_cookies: "退出登录",
  list_feeds: "看推荐",
  search_feeds: "搜索",
  get_feed_detail: "看帖子详情",
  get_user_profile: "看用户主页",
  get_my_profile: "看我的主页",
  set_like: "点赞",
  set_favorite: "收藏",
  post_comment: "发评论",
  reply_comment: "回复评论",
};

/** 展示一项脱敏浏览操作记录及允许公开的失败诊断。 */
export function BrowserTaskRecord({
  onResolve,
  onRetry,
  resolving,
  retrying,
  showConnection = false,
  task,
}: {
  /** 用户核对后给出明确结论；已生效的记为完成，未生效的转为可重试。 */
  onResolve?: (succeeded: boolean) => void;
  onRetry: () => void;
  resolving?: boolean;
  retrying: boolean;
  /** 列表内出现多种连接方式时才标注来源，否则每条重复同一信息。 */
  showConnection?: boolean;
  task: BrowserTask;
}) {
  const [decision, setDecision] = useState<boolean | null>(null);
  const status = browseStatusCopy[task.status as BrowseStatusKey];
  const hasFailureDiagnostics =
    task.status === "failed" || task.status === "needs_review";
  const needsReview = task.status === "needs_review";

  return (
    <article className="record-card flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-stone-900">
            {KIND_LABELS[task.kind]}
          </h3>
          <TaskStatusBadge status={task.status as BrowseStatusKey} />
          {showConnection && (
            <Badge>
              {connectionCopy[task.target_driver as BrowserDriver].label}
            </Badge>
          )}
        </div>
        <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-stone-600">
          {humanizeError(task.message)}
        </p>
        <p className="meta-text mt-2 flex flex-wrap items-center gap-x-2">
          <time dateTime={task.updated_at} title={formatFullTime(task.updated_at)}>
            {formatRelativeTime(task.updated_at)}
          </time>
          {task.attempts > 1 && (
            <>
              <span aria-hidden className="text-stone-300">·</span>第{" "}
              {task.attempts} 次尝试
            </>
          )}
        </p>
        {needsReview && (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="break-words text-[11px] leading-5 text-amber-900">
              {status.hint}
            </p>
            {onResolve &&
              (decision === null ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {/* 两个结论互斥且后果不同：确认生效会结案，未生效才转为可重试。 */}
                  <ActionButton
                    className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"
                    disabled={resolving}
                    onClick={() => setDecision(true)}
                    variant="outline"
                  >
                    <Check aria-hidden size={14} />
                    已经生效了
                  </ActionButton>
                  <ActionButton
                    disabled={resolving}
                    onClick={() => setDecision(false)}
                    variant="outline"
                  >
                    <X aria-hidden size={14} />
                    没有生效
                  </ActionButton>
                </div>
              ) : (
                <div aria-label="确认操作结果" className="mt-2">
                  <p className="text-xs font-semibold text-amber-950">
                    {decision
                      ? "确认这次操作已经生效？"
                      : "确认这次操作没有生效？确认后可以重试。"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActionButton
                      onClick={() => setDecision(null)}
                      variant="ghost"
                    >
                      再看看
                    </ActionButton>
                    <ActionButton
                      disabled={resolving}
                      onClick={() => {
                        onResolve(decision);
                        setDecision(null);
                      }}
                    >
                      确认
                    </ActionButton>
                  </div>
                </div>
              ))}
          </div>
        )}
        {hasFailureDiagnostics && (
          <BrowserTaskDiagnostics result={task.result} />
        )}
      </div>
      {task.status === "failed" && (
        <ActionButton disabled={retrying} onClick={onRetry} variant="outline">
          <RotateCcw
            aria-hidden
            className={retrying ? "animate-spin" : ""}
            size={14}
          />
          重试
        </ActionButton>
      )}
    </article>
  );
}

function TaskStatusBadge({ status }: { status: BrowseStatusKey }) {
  const tone =
    status === "succeeded"
      ? "success"
      : status === "failed"
        ? "danger"
        : status === "needs_review"
          ? "warning"
          : "neutral";
  return <Badge tone={tone}>{browseStatusCopy[status].label}</Badge>;
}
