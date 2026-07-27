import { FilePlus2, Search } from "lucide-react";

import type { PublicationDraft } from "../lib/publication";
import type { DraftStageFilter, DraftSummary } from "../lib/publication-index";
import { ActionButton } from "./action-button";
import { EmptyState } from "./empty-state";
import { PostSearch } from "./post-search";
import { PublicationDraftCard } from "./publication-draft-card";
import { SegmentedControl, SegmentedControlItem } from "./segmented-control";
import { SkeletonForm } from "./skeleton";

/** 左栏状态筛选的档位；与草稿的派生状态一一对应。 */
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
  onKeywordChange: (keyword: string) => void;
  onSelect: (draftId: string) => void;
  onStageChange: (stage: DraftStageFilter) => void;
  /** 本次会话里选好但还没提交的计划时间，按草稿存。 */
  schedules: Record<string, string>;
  selectedId: string;
  stage: DraftStageFilter;
  /** 服务端还有更早的草稿没取回来。 */
  truncatedAt?: number;
}

/**
 * 常驻左栏的草稿列表。
 *
 * 草稿是可反复编辑的文档，得像文档一样列出来。此前它们挤在一个原生 select
 * 里：一百份草稿就是一个操作系统下拉里的一百行截断文本，既看不出哪篇动过，
 * 也看不出哪篇发出去了。
 */
export function PublicationDraftList({
  drafts,
  visibleDrafts,
  summaries,
  keyword,
  loading,
  onCreate,
  onKeywordChange,
  onSelect,
  onStageChange,
  schedules,
  selectedId,
  stage,
  truncatedAt,
}: PublicationDraftListProps) {
  return (
    <section aria-label="草稿列表" className="control-shell flex min-w-0 flex-col p-4">
      <div className="space-y-3">
        <PostSearch
          ariaLabel="搜索草稿"
          className="w-full"
          onQueryChange={onKeywordChange}
          placeholder="搜索标题、正文或标签"
          query={keyword}
        />
        <SegmentedControl
          ariaLabel="草稿状态"
          className="flex flex-wrap"
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

      {loading && !drafts.length ? (
        <div className="mt-4">
          <SkeletonForm fields={3} />
        </div>
      ) : visibleDrafts.length ? (
        <ul className="mt-4 max-h-[70vh] min-h-0 space-y-2 overflow-y-auto pr-1">
          {visibleDrafts.map((draft) => (
            <li key={draft.draft_id}>
              <PublicationDraftCard
                draft={draft}
                onSelect={() => onSelect(draft.draft_id)}
                scheduledAt={schedules[draft.draft_id]}
                selected={draft.draft_id === selectedId}
                summary={summaries.get(draft.draft_id) ?? EMPTY_SUMMARY}
              />
            </li>
          ))}
        </ul>
      ) : drafts.length ? (
        <EmptyState
          compact
          description="换个词，或者把状态切回全部。"
          icon={Search}
          title="没有符合条件的草稿"
        />
      ) : (
        <EmptyState
          action={
            <ActionButton onClick={onCreate}>
              <FilePlus2 aria-hidden size={15} />
              新建第一份草稿
            </ActionButton>
          }
          compact
          description="准备标题、正文和本机素材后，可以一键发布或设置计划时间。"
          icon={FilePlus2}
          title="还没有发布草稿"
        />
      )}

      {truncatedAt !== undefined && (
        // 搜索是在已经取回的这批里找的，不能说"用搜索找更早的"。
        <p className="mt-3 border-t border-stone-200 pt-3 text-xs leading-5 text-stone-600">
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
