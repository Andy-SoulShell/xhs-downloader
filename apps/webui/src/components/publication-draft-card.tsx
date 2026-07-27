import { CalendarClock, CircleAlert, FileVideo2, ImagePlus } from "lucide-react";

import { formatFullTime, formatRelativeTime } from "../lib/format-time";
import type { PublicationDraft } from "../lib/publication";
import { publicationAssetUrl } from "../lib/publication-api";
import { type DraftSummary, draftStageLabel, draftTitle } from "../lib/publication-index";
import { Badge } from "./badge";
import { MediaThumbnail } from "./media-thumbnail";

/** 派生状态对应的徽标色，与任务列表保持同一套语义。 */
const STAGE_TONES = {
  unsubmitted: "neutral",
  running: "accent",
  attention: "warning",
  published: "success",
  closed: "neutral",
} as const;

interface PublicationDraftCardProps {
  draft: PublicationDraft;
  summary: DraftSummary;
  selected: boolean;
  /** 已在本次会话里选好、但还没提交的计划时间。 */
  scheduledAt?: string;
  onSelect: () => void;
}

/**
 * 草稿列表里的一行。
 *
 * 用封面和相对时间回答"哪篇是我昨天改的"：只给标题的话，一屏几十行截断
 * 文本之间没有任何区别。派生状态来自这份草稿自己的发布任务。
 */
export function PublicationDraftCard({
  draft,
  summary,
  selected,
  scheduledAt,
  onSelect,
}: PublicationDraftCardProps) {
  const cover = draft.assets[0];
  const stageLabel = draftStageLabel(summary);
  const video = cover?.media_type.startsWith("video/");
  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={`flex w-full min-w-0 items-start gap-3 rounded-2xl border p-3 text-left transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-stone-900/[0.06] ${
        selected
          ? "border-stone-900 bg-white shadow-[0_1px_2px_rgb(28_25_23/0.08),0_4px_12px_rgb(28_25_23/0.06)]"
          : "border-stone-200 bg-white hover:border-stone-400"
      }`}
      onClick={onSelect}
      type="button"
    >
      <MediaThumbnail
        alt=""
        fallback={
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-400">
            {video ? (
              <FileVideo2 aria-hidden size={18} strokeWidth={1.75} />
            ) : (
              <ImagePlus aria-hidden size={18} strokeWidth={1.75} />
            )}
          </span>
        }
        // 视频取不到帧，别拿 <img> 去加载一个必然失败的地址。
        src={cover && !video ? publicationAssetUrl(draft.draft_id, cover.asset_id) : null}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-stone-900">
          {draftTitle(draft)}
        </span>
        <span className="meta-text mt-1 flex flex-wrap items-center gap-x-2">
          <time dateTime={draft.updated_at} title={formatFullTime(draft.updated_at)}>
            {formatRelativeTime(draft.updated_at)}
          </time>
          <span aria-hidden>·</span>
          {draft.assets.length ? `${draft.assets.length} 项素材` : "还没有素材"}
        </span>
        {(stageLabel || scheduledAt || summary.attention > 0) && (
          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            {stageLabel && (
              <Badge tone={STAGE_TONES[summary.stage]}>
                <span className="truncate">{stageLabel}</span>
              </Badge>
            )}
            {summary.attention > 0 && (
              <Badge icon={CircleAlert} tone="warning">
                {summary.attention} 项等你处理
              </Badge>
            )}
            {scheduledAt && (
              <Badge icon={CalendarClock} tone="neutral">
                已排 {formatSchedule(scheduledAt)}（未提交）
              </Badge>
            )}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * 把 datetime-local 的值排成一句能扫读的时间。
 *
 * 这个时间只存在于本次会话，还没有变成任何一个发布任务，所以卡片上必须
 * 跟着"未提交"一起出现，不能长得像已经排好的日程。
 */
function formatSchedule(value: string): string {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(target);
}
