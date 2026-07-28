import { CalendarClock } from "lucide-react";
import { useMemo } from "react";

import type { PublicationTask } from "../../lib/publication";
import { orderTasksByAttention } from "../../lib/publication-index";
import { Badge } from "../badge";
import { EmptyState } from "../empty-state";
import { PublicationTaskRow } from "./task-row";

interface PublicationTaskListProps {
  tasks: PublicationTask[];
  onCancel: (taskId: string) => Promise<void>;
  onResumeVerification: (taskId: string) => Promise<void>;
  onReview: (taskId: string, published: boolean) => Promise<void>;
  onRetry: (taskId: string) => Promise<void>;
  /** 回到某次提交所用的草稿。 */
  onOpenDraft?: (draftId: string) => void;
  /** 还存在的草稿标识；源草稿已删除的任务不该留一个点不动的入口。 */
  draftIds?: Set<string>;
}

/**
 * 全部发布提交的列表。
 *
 * 等着用户处理的排在最前：一次验证没做完、一次结果没确认，都会让后面的
 * 发布停在那里，而它们混在时间序里很容易被划过去。
 */
export function PublicationTaskList({
  tasks,
  onCancel,
  onResumeVerification,
  onReview,
  onRetry,
  onOpenDraft,
  draftIds,
}: PublicationTaskListProps) {
  const ordered = useMemo(() => orderTasksByAttention(tasks), [tasks]);
  return (
    <section aria-label="发布任务" className="control-shell min-w-0 self-start p-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-base font-semibold text-stone-900">发布任务</h2>
          <p className="mt-1 text-xs text-stone-600">自动刷新进度与待确认状态</p>
        </div>
        <Badge size="regular">{tasks.length} 条</Badge>
      </div>
      {ordered.length ? (
        <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {ordered.map((task) => (
            <PublicationTaskRow
              key={task.task_id}
              onCancel={() => void onCancel(task.task_id)}
              onOpenDraft={
                onOpenDraft && draftIds?.has(task.package.draft_id)
                  ? () => onOpenDraft(task.package.draft_id)
                  : undefined
              }
              onResumeVerification={() => onResumeVerification(task.task_id)}
              onReview={(published) => void onReview(task.task_id, published)}
              onRetry={() => void onRetry(task.task_id)}
              task={task}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState
            compact
            description="保存草稿后，可选择立即发布或指定计划时间。"
            icon={CalendarClock}
            title="还没有发布任务"
          />
        </div>
      )}
    </section>
  );
}
