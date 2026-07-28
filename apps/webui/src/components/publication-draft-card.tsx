import { CalendarClock, FileVideo2, History, ImagePlus, Pencil } from "lucide-react";

import { formatFullTime, formatRelativeTime } from "../lib/format-time";
import type { PublicationDraft } from "../lib/publication";
import { publicationAssetUrl } from "../lib/publication-api";
import { type DraftSummary, draftStageLabel, draftTitle } from "../lib/publication-index";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { MediaThumbnail } from "./media-thumbnail";

/** 派生状态对应的徽标色，与发布任务用同一套语义。 */
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
  /** 本次会话里选好、但还没提交的计划时间。 */
  scheduledAt?: string;
  onOpen: () => void;
  onEdit: () => void;
  onRecords: () => void;
}

/**
 * 草稿箱里的一张卡片。
 *
 * 卡片自己说清这份草稿是什么、到哪一步了，并给出下一步的入口：点卡片看
 * 详情，编辑和记录各走各的框。状态只说一次——"需要你处理"本身就来自最近
 * 一次发布的结果，不再另起一个徽标重复。
 */
export function PublicationDraftCard({
  draft,
  summary,
  scheduledAt,
  onOpen,
  onEdit,
  onRecords,
}: PublicationDraftCardProps) {
  const cover = draft.assets[0];
  const video = cover?.media_type.startsWith("video/");
  const stageLabel = draftStageLabel(summary);
  const title = draftTitle(draft);
  return (
    <article className="group relative flex min-w-0 items-start gap-4 rounded-2xl border border-stone-200 bg-white p-4 transition-all duration-200 hover:border-stone-400 focus-within:border-stone-400">
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

      <div className="min-w-0 flex-1">
        {/* 整张卡都是打开详情的点击目标，但只留一个 Tab 停留点：
            伪元素铺满卡片，操作按钮靠 z-10 浮在它上面。 */}
        <button
          className="text-left text-sm font-semibold text-stone-900 outline-none transition after:absolute after:inset-0 after:rounded-2xl group-hover:text-red-600 focus-visible:after:ring-4 focus-visible:after:ring-stone-900/[0.06]"
          onClick={onOpen}
          type="button"
        >
          {title}
        </button>
        {draft.body && (
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-stone-600">{draft.body}</p>
        )}
        <p className="meta-text mt-1.5 flex flex-wrap items-center gap-x-2">
          <time dateTime={draft.updated_at} title={formatFullTime(draft.updated_at)}>
            {formatRelativeTime(draft.updated_at)}
          </time>
          <span aria-hidden>·</span>
          {draft.assets.length ? `${draft.assets.length} 项素材` : "还没有素材"}
        </p>
        {(stageLabel || scheduledAt) && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            {stageLabel && <Badge tone={STAGE_TONES[summary.stage]}>{stageLabel}</Badge>}
            {scheduledAt && (
              <Badge icon={CalendarClock}>已排 {formatSchedule(scheduledAt)}（未提交）</Badge>
            )}
          </p>
        )}
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-1">
        <ActionButton onClick={onEdit} variant="ghost">
          <Pencil aria-hidden size={13} />
          编辑
        </ActionButton>
        <ActionButton
          disabled={!summary.total}
          onClick={onRecords}
          title={summary.total ? undefined : "这份草稿还没有提交过"}
          variant="ghost"
        >
          <History aria-hidden size={13} />
          记录
          {summary.total > 0 && <span className="tabular-nums">{summary.total}</span>}
        </ActionButton>
      </div>
    </article>
  );
}

/**
 * 把 datetime-local 的值排成一句能扫读的时间。
 *
 * 这个时间只存在于本次会话，还没有变成任何一个发布任务，所以必须跟着
 * "未提交"一起出现，不能长得像已经排好的日程。
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
