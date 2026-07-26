import { useState } from "react";
import { Activity, CircleAlert, MonitorCheck, ShieldOff, UserRound } from "lucide-react";
import type {
  BrowserDriver,
  BrowserExtensionStatus,
  BrowserLoginState,
} from "@xhs-downloader/contracts";

import { connectionCopy } from "../lib/terminology";
import { useBrowserMonitor } from "../lib/use-browser-monitor";
import type { ManagedBrowserControl } from "../lib/use-managed-browser";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { ExtensionInstallGuide } from "./extension-install-guide";
import { ManagedBrowserPanel } from "./managed-browser-panel";

interface ConnectionPanelProps {
  account: BrowserLoginState | null;
  browserDriver: BrowserDriver | null;
  managedBrowser: ManagedBrowserControl;
}

/**
 * 展示与小红书的连接是否就绪，并提供连接方式的安装与启停入口。
 *
 * 属于设置范畴：此前它夹在搜索框和搜索结果之间，用户点了搜索要滚过
 * 好几屏运维内容才看得到帖子。
 */
export function ConnectionPanel({
  account,
  browserDriver,
  managedBrowser,
}: ConnectionPanelProps) {
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
      <section aria-label="连接状态" className="mt-6">
        <div className="grid gap-3 md:grid-cols-3">
          <StatusCard
            description={
              browserDriver
                ? connectionCopy[browserDriver].label
                : "还没有选择连接方式"
            }
            icon={MonitorCheck}
            label="连接方式"
            tone={monitor.onlineCount ? "success" : "warning"}
            value={monitor.onlineCount ? "已连接" : "未连接"}
          />
          <StatusCard
            description={
              latestExtension ? "浏览器插件正在正常通信" : "等待插件首次连接"
            }
            icon={Activity}
            label="最近通信"
            tone={latestExtension?.online ? "success" : "neutral"}
            value={
              latestExtension
                ? formatRelativeTime(latestExtension.last_seen_at)
                : "尚未连接"
            }
          />
          <StatusCard
            description={
              account?.logged_in
                ? account.nickname || "已登录，昵称暂时读不到"
                : "在小红书网页登录后回来检查"
            }
            icon={UserRound}
            label="小红书账号"
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
        <section aria-label="已连接的插件" className="mt-8">
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <ShieldOff aria-hidden className="text-stone-500" size={18} />
              <h2 className="text-lg font-semibold text-stone-950">
                已连接的插件
              </h2>
              <Badge>{monitor.extensions.length} 个</Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              断开后这个插件需要重新连接才能继续工作。还在运行的插件会自动
              重新连上；已经卸载的则从此断开。
            </p>
          </div>
          <div className="space-y-3">
            {monitor.extensions.map((item) => (
              <ExtensionRow
                extension={item}
                key={item.extension_id}
                onRevoke={() => void monitor.revoke(item.extension_id)}
                revoking={monitor.revokingExtensionId === item.extension_id}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ExtensionRow({
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
          <p className="truncate text-sm text-stone-700">
            浏览器插件
          </p>
          <p className="mt-1 text-[11px] text-stone-400">
            最近通信 {formatRelativeTime(extension.last_seen_at)}
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
            断开
          </ActionButton>
        </div>
      </div>
      {confirming && (
        <div
          aria-label="确认断开插件"
          className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
          role="alertdialog"
        >
          <p className="text-sm font-semibold text-amber-900">
            确认断开这个插件吗？
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-700">
            断开后它需要重新连接才能继续工作。还在运行的插件会自动重新连上。
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
              确认断开
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
