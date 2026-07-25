import {
  Activity,
  CircleAlert,
  Clock3,
  History,
  MonitorCheck,
  RefreshCw,
  RotateCcw,
  UserRound,
} from "lucide-react";
import type {
  BrowserDriver,
  BrowserLoginState,
  BrowserTask,
  BrowserTaskKind,
  BrowserTaskStatus,
} from "@xhs-downloader/contracts";

import { useBrowserMonitor } from "../lib/use-browser-monitor";
import type { ManagedBrowserControl } from "../lib/use-managed-browser";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { EmptyState } from "./empty-state";
import { ManagedBrowserPanel } from "./managed-browser-panel";

interface BrowserMonitorProps {
  account: BrowserLoginState | null;
  browserDriver: BrowserDriver | null;
  managedBrowser: ManagedBrowserControl;
}

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

/** 展示浏览器执行器状态、登录账号和任务审计记录。 */
export function BrowserMonitor({
  account,
  browserDriver,
  managedBrowser,
}: BrowserMonitorProps) {
  const monitor = useBrowserMonitor();
  const latestExtension = monitor.extensions[0] ?? null;

  return (
    <>
      <ManagedBrowserPanel
        control={managedBrowser}
        selected={browserDriver === "managed"}
      />
      <section aria-label="浏览器状态" className="mt-6">
        <div className="grid gap-3 md:grid-cols-3">
          <StatusCard
            description={
              latestExtension
                ? `${monitor.onlineCount}/${monitor.extensions.length} 个实例在线`
                : "等待扩展首次连接"
            }
            icon={MonitorCheck}
            label="浏览器扩展"
            tone={monitor.onlineCount ? "success" : "warning"}
            value={monitor.onlineCount ? "在线" : "离线"}
          />
          <StatusCard
            description={
              latestExtension
                ? `实例 ${latestExtension.extension_id.slice(0, 8)}`
                : "尚无心跳记录"
            }
            icon={Activity}
            label="最近心跳"
            tone={latestExtension?.online ? "success" : "neutral"}
            value={
              latestExtension
                ? formatRelativeTime(latestExtension.last_seen_at)
                : "未连接"
            }
          />
          <StatusCard
            description={
              account?.logged_in
                ? account.nickname || "当前账号昵称不可用"
                : "在小红书页面完成登录后检查"
            }
            icon={UserRound}
            label="登录账号"
            tone={account?.logged_in ? "success" : "neutral"}
            value={account?.logged_in ? "已登录" : "待检查"}
          />
        </div>
        {monitor.error && (
          <div className="mt-3">
            <Badge icon={CircleAlert} size="regular" tone="danger">
              {monitor.error}
            </Badge>
          </div>
        )}
      </section>

      <section aria-label="浏览器操作记录" className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <History aria-hidden className="text-stone-500" size={18} />
              <h2 className="text-lg font-semibold text-stone-950">
                浏览器操作记录
              </h2>
              <Badge>{monitor.tasks.length} 条</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              记录任务状态与执行结果，不展示评论正文、访问令牌或页面原文。
            </p>
          </div>
          <ActionButton
            disabled={monitor.refreshing}
            onClick={() => void monitor.refresh()}
            variant="outline"
          >
            <RefreshCw
              aria-hidden
              className={monitor.refreshing ? "animate-spin" : ""}
              size={14}
            />
            刷新
          </ActionButton>
        </div>

        {monitor.tasks.length ? (
          <div className="space-y-3">
            {monitor.tasks.map((task) => (
              <BrowserTaskRecord
                key={task.task_id}
                onRetry={() => void monitor.retry(task.task_id)}
                retrying={monitor.retryingTaskId === task.task_id}
                task={task}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            description="检查登录、读取内容或执行互动后，持久化任务会显示在这里。"
            icon={Clock3}
            title="还没有浏览器操作记录"
          />
        )}
      </section>
    </>
  );
}

function StatusCard({
  description,
  icon: Icon,
  label,
  tone,
  value,
}: {
  description: string;
  icon: typeof Activity;
  label: string;
  tone: "neutral" | "success" | "warning";
  value: string;
}) {
  return (
    <article className="control-shell min-w-0 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-600">
          <Icon aria-hidden size={16} />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-stone-500">{label}</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-semibold text-stone-900">{value}</p>
            <Badge tone={tone}>{tone === "success" ? "正常" : "待处理"}</Badge>
          </div>
          <p className="mt-1 truncate text-[11px] text-stone-400">
            {description}
          </p>
        </div>
      </div>
    </article>
  );
}

function BrowserTaskRecord({
  onRetry,
  retrying,
  task,
}: {
  onRetry: () => void;
  retrying: boolean;
  task: BrowserTask;
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-stone-900">
            {KIND_LABELS[task.kind]}
          </h3>
          <TaskStatusBadge status={task.status} />
          <span className="text-[11px] text-stone-400">
            #{task.task_id.slice(0, 8)}
          </span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
          {task.message}
        </p>
        <p className="mt-2 text-[11px] text-stone-400">
          {formatTime(task.updated_at)} · 已领取 {task.attempts} 次
        </p>
        {task.status === "needs_review" && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            结果可能已写入小红书，请人工核对，禁止直接重试。
          </p>
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

function formatRelativeTime(value: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 10) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  return `${Math.floor(seconds / 60)} 分钟前`;
}
