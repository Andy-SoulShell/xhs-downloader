import { Copy, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { JsonValue } from "@xhs-downloader/contracts";

import {
  safeBrowserTaskDiagnostics,
  serializeSafeBrowserTaskDiagnostics,
} from "../lib/browser-task-diagnostics";
import { ActionButton } from "./action-button";

const FIELD_LABELS = {
  adapter_version: "适配器版本",
  selector_profile: "选择器方案",
  page_kind: "页面类型",
} as const;

const VALUE_LABELS: Record<string, string> = {
  home: "推荐页",
  search: "搜索页",
  feed_detail: "帖子详情页",
  profile: "用户主页",
  unknown: "未知",
  "initial-state-v1": "页面初始状态",
  "semantic-dom-v1": "语义化页面结构",
};

const ANCHOR_LABELS: Record<string, string> = {
  initial_state: "页面初始状态",
  main_container: "主内容容器",
  feed_container: "帖子列表",
  filter_control: "搜索筛选",
  comment_container: "评论区域",
  detail_container: "帖子详情",
  profile_container: "用户主页",
};

/** 展示并复制经过严格白名单过滤的页面兼容性诊断。 */
export function BrowserTaskDiagnostics({
  result,
}: {
  result: Record<string, JsonValue> | null;
}) {
  const diagnostics = useMemo(
    () => safeBrowserTaskDiagnostics(result),
    [result],
  );
  const [copyMessage, setCopyMessage] = useState("");

  if (!diagnostics) {
    return (
      <p className="mt-2 break-words text-[11px] leading-5 text-stone-400">
        本次任务没有可公开的页面诊断。
      </p>
    );
  }

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(
        serializeSafeBrowserTaskDiagnostics(diagnostics),
      );
      setCopyMessage("安全诊断已复制");
    } catch {
      setCopyMessage("复制失败，请稍后重试");
    }
  };

  return (
    <section
      aria-label="安全页面诊断"
      className="mt-3 min-w-0 rounded-xl bg-stone-50 p-3"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-stone-600">
          <ShieldCheck aria-hidden className="shrink-0" size={13} />
          安全页面诊断
        </p>
        <ActionButton
          aria-label="复制安全页面诊断"
          onClick={() => void copyDiagnostics()}
          variant="ghost"
        >
          <Copy aria-hidden size={13} />
          复制
        </ActionButton>
      </div>

      <dl className="mt-2 grid min-w-0 gap-2 text-[11px] sm:grid-cols-3">
        {Object.entries(FIELD_LABELS).map(([field, label]) => {
          const value = diagnostics[field as keyof typeof FIELD_LABELS];
          if (typeof value !== "string") return null;
          return (
            <div className="min-w-0" key={field}>
              <dt className="text-stone-400">{label}</dt>
              <dd className="mt-0.5 break-all font-medium text-stone-700">
                {VALUE_LABELS[value] ?? value}
              </dd>
            </div>
          );
        })}
      </dl>

      <AnchorList
        anchors={diagnostics.matched_anchors}
        emptyLabel="未命中"
        label="已命中语义锚点"
        tone="success"
      />
      <AnchorList
        anchors={diagnostics.missing_anchors}
        emptyLabel="无"
        label="缺失语义锚点"
        tone="warning"
      />
      <p
        aria-live="polite"
        className="mt-2 min-h-4 break-words text-[11px] text-stone-500"
      >
        {copyMessage}
      </p>
    </section>
  );
}

function AnchorList({
  anchors,
  emptyLabel,
  label,
  tone,
}: {
  anchors: string[];
  emptyLabel: string;
  label: string;
  tone: "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-amber-50 text-amber-700";
  return (
    <div className="mt-2 min-w-0">
      <p className="text-[11px] text-stone-400">{label}</p>
      <div className="mt-1 flex min-w-0 flex-wrap gap-1">
        {anchors.length ? (
          anchors.map((anchor) => (
            <span
              className={`max-w-full break-all rounded-md px-1.5 py-0.5 text-[10px] ${toneClass}`}
              key={anchor}
            >
              {ANCHOR_LABELS[anchor]}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-stone-400">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}
