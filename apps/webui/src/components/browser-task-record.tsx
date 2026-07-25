import { RotateCcw } from "lucide-react";
import type {
  BrowserDriver,
  BrowserTask,
  BrowserTaskKind,
  BrowserTaskStatus,
} from "@xhs-downloader/contracts";

import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { BrowserTaskDiagnostics } from "./browser-task-diagnostics";

const KIND_LABELS: Record<BrowserTaskKind, string> = {
  check_login_status: "检查登录",
  get_login_qrcode: "获取登录二维码",
  delete_cookies: "清除 Cookie",
  list_feeds: "读取推荐",
  search_feeds: "搜索帖子",
  get_feed_detail: "读取详情",
  get_user_profile: "读取用户主页",
  get_my_profile: "读取当前账号",
  set_like: "设置点赞",
  set_favorite: "设置收藏",
  post_comment: "发表评论",
  reply_comment: "回复评论",
};

const STATUS_LABELS: Record<BrowserTaskStatus, string> = {
  queued: "排队中",
  claimed: "已领取",
  running: "执行中",
  succeeded: "已完成",
  failed: "失败",
  needs_review: "需要确认",
};

const DRIVER_LABELS: Record<BrowserDriver, string> = {
  extension: "浏览器扩展",
  managed: "受管浏览器",
};

/** 展示一项脱敏浏览器任务记录及允许公开的失败诊断。 */
export function BrowserTaskRecord({
  onRetry,
  retrying,
  task,
}: {
  onRetry: () => void;
  retrying: boolean;
  task: BrowserTask;
}) {
  const hasFailureDiagnostics =
    task.status === "failed" || task.status === "needs_review";
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-stone-900">
            {KIND_LABELS[task.kind]}
          </h3>
          <TaskStatusBadge status={task.status} />
          <Badge>执行器：{DRIVER_LABELS[task.target_driver]}</Badge>
          <span className="text-[11px] text-stone-400">
            #{task.task_id.slice(0, 8)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-stone-500">
          {task.message}
        </p>
        <p className="mt-2 break-words text-[11px] text-stone-400">
          {formatTime(task.updated_at)} · 已领取 {task.attempts} 次
        </p>
        {task.status === "needs_review" && (
          <p className="mt-2 break-words text-xs font-medium text-amber-700">
            结果可能已写入小红书，请人工核对，禁止直接重试。
          </p>
        )}
        {hasFailureDiagnostics && (
          <BrowserTaskDiagnostics result={task.result} />
        )}
      </div>
      {task.status === "failed" && (
        <ActionButton
          disabled={retrying}
          onClick={onRetry}
          variant="outline"
        >
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

function TaskStatusBadge({ status }: { status: BrowserTaskStatus }) {
  const tone =
    status === "succeeded"
      ? "success"
      : status === "failed"
        ? "danger"
        : status === "needs_review"
          ? "warning"
          : "neutral";
  return <Badge tone={tone}>{STATUS_LABELS[status]}</Badge>;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
