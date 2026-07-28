import type { PublicationDraft, PublicationTask } from "../lib/publication";
import { draftTitle } from "../lib/publication-index";
import { Badge } from "./badge";
import { DialogShell } from "./dialog-shell";
import { PublicationTaskRow } from "./publication-task-row";

interface PublicationRecordsDialogProps {
  draft: PublicationDraft;
  /** 这份草稿的发布任务，已按提交时间从新到旧。 */
  tasks: PublicationTask[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 关闭后把焦点还给打开它的按钮。 */
  onRestoreFocus?: () => void;
  onCancel: (taskId: string) => Promise<void>;
  onResumeVerification: (taskId: string) => Promise<void>;
  onReview: (taskId: string, published: boolean) => Promise<void>;
  onRetry: (taskId: string) => Promise<void>;
}

/**
 * 一份草稿提交过的发布记录。
 *
 * 每一条都是提交那一刻冻结的快照，与草稿现在的样子未必相同，所以按时间
 * 从新到旧单独列出，而不是塞进编辑表单里当尾巴。
 */
export function PublicationRecordsDialog({
  draft,
  tasks,
  open,
  onOpenChange,
  onRestoreFocus,
  onCancel,
  onResumeVerification,
  onReview,
  onRetry,
}: PublicationRecordsDialogProps) {
  return (
    <DialogShell
      description="每一条都是提交那一刻的内容快照，与现在的草稿可能已经不同。"
      meta={<Badge tone="neutral">{tasks.length} 条</Badge>}
      onOpenChange={onOpenChange}
      onRestoreFocus={onRestoreFocus}
      open={open}
      title={`「${draftTitle(draft)}」的发布记录`}
      width="max-w-2xl"
    >
      {tasks.length ? (
        <div className="space-y-2">
          {tasks.map((task) => (
            <PublicationTaskRow
              key={task.task_id}
              onCancel={() => void onCancel(task.task_id)}
              onResumeVerification={() => onResumeVerification(task.task_id)}
              onReview={(published) => void onReview(task.task_id, published)}
              onRetry={() => void onRetry(task.task_id)}
              task={task}
            />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-sm leading-6 text-stone-600">这份草稿还没有提交过。</p>
      )}
    </DialogShell>
  );
}
