import { FilePlus2, Search } from "lucide-react";

import type { PublicationDraft } from "../../lib/publication";
import type { DraftStageFilter, DraftSummary } from "../../lib/publication-index";
import { ActionButton } from "../action-button";
import { EmptyState } from "../empty-state";
import { PostSearch } from "../post-search";
import { PublicationDraftCard } from "./draft-card";
import { SegmentedControl, SegmentedControlItem } from "../segmented-control";
import { SkeletonForm } from "../skeleton";

/**
 * 出现筛选条的草稿数下限。
 *
 * 少于这个数一眼就能扫完，搜索框加五个状态 chip 会比它筛的内容还高。
 */
const FILTER_THRESHOLD = 6;

const STAGE_FILTERS: { value: DraftStageFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "unsubmitted", label: "未提交" },
  { value: "running", label: "进行中" },
  { value: "attention", label: "等你处理" },
  { value: "published", label: "已发布" },
];

interface PublicationDraftListProps {
  drafts: PublicationDraft[];
  /** 关键词与状态筛掉之后真正显示的草稿。 */
  visibleDrafts: PublicationDraft[];
  summaries: Map<string, DraftSummary>;
  keyword: string;
  loading: boolean;
  onCreate: () => void;
  onEdit: (draftId: string) => void;
  onKeywordChange: (keyword: string) => void;
  onOpen: (draftId: string) => void;
  onRecords: (draftId: string) => void;
  onStageChange: (stage: DraftStageFilter) => void;
  /** 本次会话里选好但还没提交的计划时间，按草稿存。 */
  schedules: Record<string, string>;
  stage: DraftStageFilter;
  /** 服务端还有更早的草稿没取回来。 */
  truncatedAt?: number;
}

/** 草稿箱：一列全宽卡片，每张卡自己说清状态并给出下一步入口。 */
export function PublicationDraftList({
  drafts,
  visibleDrafts,
  summaries,
  keyword,
  loading,
  onCreate,
  onEdit,
  onKeywordChange,
  onOpen,
  onRecords,
  onStageChange,
  schedules,
  stage,
  truncatedAt,
}: PublicationDraftListProps) {
  if (loading && !drafts.length) return <SkeletonForm fields={3} />;

  if (!drafts.length) {
    return (
      <EmptyState
        action={
          <ActionButton onClick={onCreate}>
            <FilePlus2 aria-hidden size={15} />
            新建第一份草稿
          </ActionButton>
        }
        description="准备标题、正文和本机素材后，可以一键发布或设置计划时间。"
        icon={FilePlus2}
        title="还没有发布草稿"
      />
    );
  }

  return (
    <section aria-label="草稿箱" className="min-w-0 space-y-3">
      {drafts.length >= FILTER_THRESHOLD && (
        <div className="flex flex-wrap items-center gap-3">
          <PostSearch
            ariaLabel="搜索草稿"
            className="sm:w-72"
            onQueryChange={onKeywordChange}
            placeholder="搜索标题、正文或标签"
            query={keyword}
          />
          <SegmentedControl
            ariaLabel="草稿状态"
            onValueChange={(next) => onStageChange(next as DraftStageFilter)}
            value={stage}
          >
            {STAGE_FILTERS.map((item) => (
              <SegmentedControlItem key={item.value} value={item.value}>
                {item.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
      )}

      {visibleDrafts.length ? (
        <ul className="space-y-2">
          {visibleDrafts.map((draft) => (
            <li key={draft.draft_id}>
              <PublicationDraftCard
                draft={draft}
                onEdit={() => onEdit(draft.draft_id)}
                onOpen={() => onOpen(draft.draft_id)}
                onRecords={() => onRecords(draft.draft_id)}
                scheduledAt={schedules[draft.draft_id]}
                summary={summaries.get(draft.draft_id) ?? EMPTY_SUMMARY}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          compact
          description="换个词，或者把状态切回全部。"
          icon={Search}
          title="没有符合条件的草稿"
        />
      )}

      {truncatedAt !== undefined && (
        // 搜索是在已经取回的这批里找的，不能说"用搜索找更早的"。
        <p className="border-t border-stone-200 pt-3 text-xs leading-5 text-stone-600">
          只列出最近 {truncatedAt} 份草稿，更早的还在本机，暂时不在这里显示。
        </p>
      )}
    </section>
  );
}

/** 草稿刚建出来、派生信息还没算到时的占位。 */
const EMPTY_SUMMARY: DraftSummary = {
  stage: "unsubmitted",
  attention: 0,
  total: 0,
  drifted: false,
};
