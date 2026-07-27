import { CalendarClock, ExternalLink, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { PublicationMode } from "../lib/publication";
import { connectionCopy } from "../lib/terminology";
import type { BrowserDriver } from "../lib/types";
import { ActionButton } from "./action-button";

interface PublicationSubmitControlsProps {
  browserDriver: BrowserDriver;
  busy: string;
  onScheduledAtChange: (value: string) => void;
  onSubmit: (mode: PublicationMode) => Promise<void>;
  products: string[];
  scheduledAt: string;
}

const LABELS: Record<PublicationMode, string> = {
  manual: "立即发布",
  scheduled: "本地定时",
  platform_scheduled: "官方定时",
};

/** 提供三种发布方式，并在执行前显示不可跳过的二次确认。 */
export function PublicationSubmitControls({
  browserDriver,
  busy,
  onScheduledAtChange,
  onSubmit,
  products,
  scheduledAt,
}: PublicationSubmitControlsProps) {
  const [pending, setPending] = useState<PublicationMode | null>(null);
  const confirm = async () => {
    if (!pending) return;
    await onSubmit(pending);
    setPending(null);
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
      <label className="block text-xs font-semibold text-stone-700">
        计划发布时间
        <input
          className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-normal text-stone-900 outline-none focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
          min={minimumSchedule()}
          onChange={(event) => onScheduledAtChange(event.target.value)}
          type="datetime-local"
          value={scheduledAt}
        />
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <ActionButton
          disabled={Boolean(busy)}
          onClick={() => setPending("scheduled")}
          variant="outline"
        >
          <CalendarClock aria-hidden size={15} />
          本地定时
        </ActionButton>
        <ActionButton
          disabled={Boolean(busy)}
          onClick={() => setPending("platform_scheduled")}
          variant="outline"
        >
          <CalendarClock aria-hidden size={15} />
          官方定时
        </ActionButton>
        <ActionButton disabled={Boolean(busy)} onClick={() => setPending("manual")}>
          <Send aria-hidden size={15} />
          立即发布
          {browserDriver === "extension" && <ExternalLink aria-hidden size={13} />}
        </ActionButton>
      </div>
      <div className="mt-3 space-y-1 text-[11px] leading-5 text-stone-600">
        <p>本地定时：到点后需本机服务和{driverLabel(browserDriver)}在线。</p>
        <p>
          官方定时：现在由{driverLabel(browserDriver)}
          打开创作页，提交给平台在 1 小时至 14 天内发布。
        </p>
      </div>

      {pending && (
        <div
          aria-label="发布确认"
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <div className="flex items-start gap-2">
            <ShieldCheck aria-hidden className="mt-0.5 shrink-0 text-amber-700" size={16} />
            <div className="min-w-0 text-xs leading-5 text-amber-900">
              {/* 二次确认要说清点下去会发生什么、还能不能撤回。三种方式后果完全
                  不同，此前却共用同一句“将使用当前选定浏览器中的登录账号操作”，
                  除了标题里的名字之外没有任何区别，等于白确认一次。 */}
              <p className="font-semibold">{confirmTitle(pending)}</p>
              <p>{confirmDetail(pending, browserDriver, scheduledAt)}</p>
              <p className="mt-2">会用{driverLabel(browserDriver)}里你已经登录的账号操作小红书。</p>
              {products.length > 0 && (
                <p className="mt-2 break-words">将绑定商品：{products.join("、")}</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <ActionButton disabled={Boolean(busy)} onClick={() => setPending(null)} variant="ghost">
              返回修改
            </ActionButton>
            <ActionButton disabled={Boolean(busy)} onClick={() => void confirm()}>
              {busy ? "正在处理…" : `确认${LABELS[pending]}`}
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}

function minimumSchedule(): string {
  const value = new Date(Date.now() + 60_000);
  value.setSeconds(0, 0);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** 确认框标题：直接说这一步会做什么，而不是复述按钮名。 */
function confirmTitle(mode: PublicationMode): string {
  if (mode === "manual") return "现在就发出去？";
  if (mode === "scheduled") return "交给本机到点发布？";
  return "交给小红书平台定时发布？";
}

/** 确认框正文：写清后果与前提，尤其是能不能撤回。 */
function confirmDetail(mode: PublicationMode, driver: BrowserDriver, scheduledAt: string): string {
  const label = driverLabel(driver);
  if (mode === "manual") {
    return `点确认就立刻用${label}打开创作页提交，发出去之后这边撤不回来。`;
  }
  const when = scheduledAt ? scheduledAt.replace("T", " ") : "你选定的时间";
  if (mode === "scheduled") {
    return `到 ${when} 由本机服务唤起${label}发布。这段时间本机服务和${label}都要在线，否则会错过。`;
  }
  return `现在就用${label}打开创作页，把 ${when} 的定时交给小红书。之后不需要本机在线，但时间必须落在平台允许的 1 小时到 14 天内。`;
}

/** 连接方式的叫法与设置页保持一致，不再另起“受管浏览器”“浏览器扩展”两套。 */
function driverLabel(driver: BrowserDriver): string {
  return connectionCopy[driver].label;
}
