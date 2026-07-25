import { CalendarClock, ExternalLink, Send, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { PublicationMode } from "../lib/publication";
import { ActionButton } from "./action-button";

interface PublicationSubmitControlsProps {
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
        <ActionButton
          disabled={Boolean(busy)}
          onClick={() => setPending("manual")}
        >
          <Send aria-hidden size={15} />
          立即发布
          <ExternalLink aria-hidden size={13} />
        </ActionButton>
      </div>
      <div className="mt-3 space-y-1 text-[11px] leading-5 text-stone-500">
        <p>本地定时：到点后才要求本机服务、浏览器和扩展在线。</p>
        <p>官方定时：现在打开创作页，提交给平台在 1 小时至 14 天内发布。</p>
      </div>

      {pending && (
        <div
          aria-label="发布确认"
          className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
        >
          <div className="flex items-start gap-2">
            <ShieldCheck
              aria-hidden
              className="mt-0.5 shrink-0 text-amber-700"
              size={16}
            />
            <div className="min-w-0 text-xs leading-5 text-amber-900">
              <p className="font-semibold">
                确认执行“{LABELS[pending]}”吗？
              </p>
              <p>扩展将使用当前登录账号操作小红书创作平台。</p>
              {products.length > 0 && (
                <p className="mt-2 break-words">
                  将绑定商品：{products.join("、")}
                </p>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <ActionButton
              disabled={Boolean(busy)}
              onClick={() => setPending(null)}
              variant="ghost"
            >
              返回修改
            </ActionButton>
            <ActionButton
              disabled={Boolean(busy)}
              onClick={() => void confirm()}
            >
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
