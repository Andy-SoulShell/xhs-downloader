import { useState } from "react";
import {
  Activity,
  CircleAlert,
  Clock3,
  History,
  MonitorCheck,
  RefreshCw,
  ShieldOff,
  UserRound,
} from "lucide-react";
import type {
  BrowserDriver,
  BrowserExtensionStatus,
  BrowserLoginState,
} from "@xhs-downloader/contracts";

import { useBrowserMonitor } from "../lib/use-browser-monitor";
import type { ManagedBrowserControl } from "../lib/use-managed-browser";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { EmptyState } from "./empty-state";
import { ExtensionInstallGuide } from "./extension-install-guide";
import { ManagedBrowserPanel } from "./managed-browser-panel";
import { BrowserTaskRecord } from "./browser-task-record";

interface BrowserMonitorProps {
  account: BrowserLoginState | null;
  browserDriver: BrowserDriver | null;
  managedBrowser: ManagedBrowserControl;
}

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
      <ExtensionInstallGuide
        browserDriver={browserDriver}
        onlineCount={monitor.onlineCount}
        onRefresh={monitor.refresh}
        refreshing={monitor.refreshing}
      />
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

      {monitor.extensions.length > 0 && (
        <section aria-label="扩展登记" className="mt-8">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <ShieldOff aria-hidden className="text-stone-500" size={18} />
              <h2 className="text-lg font-semibold text-stone-950">扩展登记</h2>
              <Badge>{monitor.extensions.length} 条</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              注销后旧令牌立即失效；仍在运行的扩展会自动重新登记，已卸载扩展
              或疑似泄露的令牌则从此无法通过认证。
            </p>
          </div>
          <div className="space-y-3">
            {monitor.extensions.map((item) => (
              <ExtensionRegistrationRow
                extension={item}
                key={item.extension_id}
                onRevoke={() => void monitor.revoke(item.extension_id)}
                revoking={monitor.revokingExtensionId === item.extension_id}
              />
            ))}
          </div>
        </section>
      )}

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
                onResolve={(succeeded) =>
                  void monitor.review(task.task_id, succeeded)
                }
                onRetry={() => void monitor.retry(task.task_id)}
                resolving={monitor.reviewingTaskId === task.task_id}
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

function ExtensionRegistrationRow({
  extension,
  onRevoke,
  revoking,
}: {
  extension: BrowserExtensionStatus;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <article className="control-shell min-w-0 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-stone-700">
            {extension.extension_id}
          </p>
          <p className="mt-1 text-[11px] text-stone-400">
            最近心跳 {formatRelativeTime(extension.last_seen_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={extension.online ? "success" : "neutral"}>
            {extension.online ? "在线" : "离线"}
          </Badge>
          <ActionButton
            disabled={revoking || confirming}
            onClick={() => setConfirming(true)}
            variant="outline"
          >
            注销
          </ActionButton>
        </div>
      </div>
      {confirming && (
        <div
          aria-label="确认注销扩展登记"
          className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
          role="alertdialog"
        >
          <p className="text-sm font-semibold text-amber-900">
            确认注销该扩展登记吗？
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-700">
            该实例的能力令牌会立即失效；仍在运行的扩展会在下次连接时自动
            重新登记。
          </p>
          <div className="mt-3 flex gap-2">
            <ActionButton onClick={() => setConfirming(false)} variant="ghost">
              取消
            </ActionButton>
            <ActionButton
              disabled={revoking}
              onClick={() => {
                setConfirming(false);
                onRevoke();
              }}
            >
              确认注销
            </ActionButton>
          </div>
        </div>
      )}
    </article>
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

function formatRelativeTime(value: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 10) return "刚刚";
  if (seconds < 60) return `${seconds} 秒前`;
  return `${Math.floor(seconds / 60)} 分钟前`;
}
