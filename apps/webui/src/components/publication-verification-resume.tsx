import { CheckCircle2, ScanLine, ShieldCheck, X } from "lucide-react";
import { useRef, useState } from "react";

import { ActionButton } from "./action-button";

interface PublicationVerificationResumeProps {
  onResume: () => Promise<void>;
}

/** 引导用户在受管浏览器完成验证，并在二次确认后恢复原发布页面。 */
export function PublicationVerificationResume({
  onResume,
}: PublicationVerificationResumeProps) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const resume = async () => {
    if (inFlight.current || accepted) return;
    inFlight.current = true;
    setSubmitting(true);
    setError("");
    try {
      await onResume();
      setAccepted(true);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "验证恢复请求失败，请重试",
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start gap-2">
        <ScanLine
          aria-hidden
          className="mt-0.5 shrink-0 text-amber-700"
          size={16}
        />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-amber-950">
            原发布任务已暂停，正在等待页面验证
          </p>
          <p className="mt-1 text-[11px] leading-5 text-amber-900">
            请切换到受管浏览器，在当前创作页完成扫码或安全验证。不要关闭或刷新该页面。
          </p>
        </div>
      </div>

      {accepted ? (
        <div
          aria-live="polite"
          className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"
        >
          <CheckCircle2 aria-hidden className="mt-0.5 shrink-0" size={15} />
          <span>恢复请求已受理，正在原页面继续，请勿重复提交。</span>
        </div>
      ) : confirming ? (
        <div
          aria-label="确认恢复验证任务"
          className="mt-3 rounded-lg border border-amber-300 bg-white p-3"
          role="alertdialog"
        >
          <p className="text-xs font-semibold text-stone-900">
            确认已经在受管浏览器完成验证？
          </p>
          <p className="mt-1 text-[11px] leading-5 text-stone-600">
            确认后只恢复当前暂停页面，不会新建任务。若页面仍显示验证，请先返回完成。
          </p>
          {error && (
            <p
              aria-live="assertive"
              className="mt-2 text-xs leading-5 text-red-700"
              role="alert"
            >
              继续失败：{error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              disabled={submitting}
              onClick={() => {
                setConfirming(false);
                setError("");
              }}
              variant="ghost"
            >
              <X aria-hidden size={13} />
              返回检查
            </ActionButton>
            <ActionButton
              disabled={submitting}
              onClick={() => void resume()}
            >
              <ShieldCheck aria-hidden size={13} />
              {submitting ? "正在继续原任务…" : "确认验证完成并继续"}
            </ActionButton>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <ActionButton onClick={() => setConfirming(true)} variant="outline">
            <ShieldCheck aria-hidden size={13} />
            我已完成验证，继续原任务
          </ActionButton>
        </div>
      )}
    </div>
  );
}
