import type { PublicationTask } from "../lib/publication";
import { PublicationTaskRow } from "./publication-task-row";

interface PublicationTimelineProps {
  tasks: PublicationTask[];
  onCancel: (taskId: string) => Promise<void>;
  onResumeVerification: (taskId: string) => Promise<void>;
  onReview: (taskId: string, published: boolean) => Promise<void>;
  onRetry: (taskId: string) => Promise<void>;
}

/**
 * 这份草稿自己的发布记录。
 *
 * 就在编辑器底部，按提交时间从新到旧。此前发布记录只在另一个标签页里，
 * 而且不按草稿分组——想知道"这篇发出去了没有"得先离开正在编辑的内容，
 * 再去一列混着所有草稿的任务里翻。
 *
 * @param props 组件属性。
 * @param props.tasks 该草稿的任务，已按提交时间从新到旧。
 * @param props.onCancel 取消任务。
 * @param props.onResumeVerification 确认验证完成并继续。
 * @param props.onReview 提交人工核对结论。
 * @param props.onRetry 重试失败的任务。
 * @returns 编辑器底部的发布记录区。
 */
export function PublicationTimeline({
  tasks,
  onCancel,
  onResumeVerification,
  onReview,
  onRetry,
}: PublicationTimelineProps) {
  return (
    <section aria-label="这份草稿的发布记录" className="border-t border-stone-200 pt-5">
      <h3 className="text-sm font-semibold text-stone-800">发布记录</h3>
      {tasks.length ? (
        <div className="mt-3 space-y-2">
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
        <p className="mt-2 text-xs leading-5 text-stone-600">
          这份草稿还没有提交过。发布或设置计划时间后，每一次提交都会记在这里。
        </p>
      )}
    </section>
  );
}
