import { CircleAlert, Monitor, Power, RefreshCw, Square } from "lucide-react";

import type { ManagedBrowserControl } from "../lib/use-managed-browser";
import type { ManagedBrowserState } from "../lib/managed-browser-api";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";

const STATE_LABELS: Record<ManagedBrowserState, string> = {
  stopped: "已停止",
  starting: "启动中",
  running: "运行中",
  stopping: "停止中",
  error: "异常",
};

/** 展示并控制软件自带的 Chromium 的普通用户生命周期。 */
export function ManagedBrowserPanel({
  control,
  selected,
}: {
  control: ManagedBrowserControl;
  selected: boolean;
}) {
  const status = control.status;
  const busy = control.loading || control.refreshing || control.operation !== null;
  const canStart =
    Boolean(status?.installed) &&
    status?.state !== "running" &&
    status?.state !== "starting" &&
    status?.state !== "stopping";
  const canStop = status?.state === "running" || status?.state === "error";
  const hint = repairHint(status, control.error);
  const warning = hintIsWarning(status, control.error);

  return (
    <section aria-label="软件自带浏览器控制" className="control-shell mt-6 min-w-0 p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Monitor aria-hidden className="text-red-500" size={18} />
            <h2 className="text-sm font-semibold text-stone-900">软件自带浏览器</h2>
            <Badge tone={selected ? "accent" : "neutral"}>
              {selected ? "当前使用" : "可以选用"}
            </Badge>
            <Badge tone={statusTone(status?.state, control.operation)}>
              {control.loading
                ? "正在检测"
                : control.operation === "start"
                  ? "启动中"
                  : control.operation === "stop"
                    ? "停止中"
                    : status
                      ? STATE_LABELS[status.state]
                      : "状态未知"}
            </Badge>
          </div>
          <p className="mt-2 break-words text-xs leading-5 text-stone-600">
            {status?.message ||
              (control.loading
                ? "正在检测本机 Chrome 或 Chromium。"
                : "尚未取得软件自带浏览器状态。")}
          </p>
          <p className="mt-1 break-words text-[11px] leading-5 text-stone-400">
            {installationSummary(status)}
          </p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <ActionButton
            aria-label="刷新软件自带浏览器状态"
            disabled={busy}
            onClick={() => void control.refresh()}
            variant="outline"
          >
            <RefreshCw aria-hidden className={control.refreshing ? "animate-spin" : ""} size={14} />
            刷新
          </ActionButton>
          <ActionButton disabled={busy || !canStart} onClick={() => void control.start()}>
            <Power aria-hidden size={14} />
            {control.operation === "start" ? "启动中" : "启动"}
          </ActionButton>
          <ActionButton
            disabled={busy || !canStop}
            onClick={() => void control.stop()}
            variant="outline"
          >
            <Square aria-hidden size={13} />
            {control.operation === "stop" ? "停止中" : "停止"}
          </ActionButton>
        </div>
      </div>

      {(hint || control.error) && (
        <div
          className={`mt-4 rounded-2xl border p-3 text-xs leading-5 ${
            warning
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-stone-200 bg-stone-50 text-stone-600"
          }`}
        >
          {control.error && (
            <p className="flex items-start gap-2 font-medium">
              <CircleAlert aria-hidden className="mt-0.5 shrink-0" size={14} />
              <span className="break-words">{control.error}</span>
            </p>
          )}
          {hint && <p className={control.error ? "mt-1" : ""}>{hint}</p>}
        </div>
      )}
    </section>
  );
}

function installationSummary(status: ManagedBrowserControl["status"]): string {
  if (!status) return "状态刷新后会显示安装和登录资料信息。";
  if (!status.installed) return "未检测到 Chrome 或 Chromium。";
  const executable = status.executable_name || "Chrome / Chromium";
  return status.profile_persistent
    ? `${executable} · 独立登录资料会保存在本机`
    : `${executable} · 登录资料不会持久保存`;
}

function statusTone(
  state: ManagedBrowserState | undefined,
  operation: ManagedBrowserControl["operation"],
): "danger" | "neutral" | "success" | "warning" {
  if (operation) return "warning";
  if (state === "running") return "success";
  if (state === "error") return "danger";
  if (state === "starting" || state === "stopping") return "warning";
  return "neutral";
}

function repairHint(status: ManagedBrowserControl["status"], error: string): string {
  if (isLockConflict(error)) {
    return "请关闭另一个正在使用此软件自带浏览器目录的 xhs-downloader 服务，再刷新状态。";
  }
  if (error.includes("未检测到")) {
    return "请安装 Chrome 或 Chromium；若已经安装，请在设置中填写软件自带浏览器可执行文件。";
  }
  if (error) {
    return "请先刷新状态；若仍失败，请检查浏览器可执行文件设置和本机服务日志。";
  }
  if (status && !status.installed) {
    return "请安装 Chrome 或 Chromium；若已经安装，请在设置中填写软件自带浏览器可执行文件。";
  }
  if (status?.state === "error") {
    return "请先停止后重新启动；若持续失败，请检查浏览器可执行文件设置和本机服务日志。";
  }
  if (status?.state === "stopped") {
    // 二维码在「内容 → 浏览小红书」里，不在这一页；写“上方二维码”会让人在设置页干找。
    return "首次使用请先启动；启动后到「内容 → 浏览小红书」里获取二维码完成登录。";
  }
  if (status?.state === "running") {
    // 与 stopped 分支同理：这一页没有二维码按钮，指向它所在的工作台。
    return "浏览器已经就绪；首次使用请到「内容 → 浏览小红书」里获取二维码完成登录。";
  }
  return "";
}

/**
 * 判断提示块该用警示还是普通说明的外观。
 *
 * 就绪后的引导语不是警告，套琥珀色会让用户以为出了问题。
 */
function hintIsWarning(status: ManagedBrowserControl["status"], error: string): boolean {
  if (error) return true;
  return status?.state !== "running" && status?.state !== "stopped";
}

function isLockConflict(message: string): boolean {
  return (
    message.includes("另一个服务实例") || (message.includes("用户目录") && message.includes("占用"))
  );
}
