import { Download, History, Puzzle } from "lucide-react";

import { useBrowserMonitor } from "../lib/use-browser-monitor";
import type { ClientDownloadRecord, DownloadTask } from "../lib/types";
import { BoardTabs } from "./board-tabs";
import { BrowserTaskRecord } from "./browser-task-record";
import { EmptyState } from "./empty-state";
import { SkeletonRecordList } from "./skeleton";
import { PageHeading } from "./page-heading";
import { RecordBoard, TaskBoard } from "./task-center";

/**
 * 汇总下载、插件下载与浏览操作三类历史。
 *
 * 此前它们分散在三个工作台，同一个"完成"有三种说法，用户想回顾
 * 做过什么时不知道该去哪里看。
 */
export function ActivityBoard({
  loading = false,
  onRetryDownload,
  records,
  tasks,
}: {
  loading?: boolean;
  onRetryDownload: (taskId: string) => void;
  records: ClientDownloadRecord[];
  tasks: DownloadTask[];
}) {
  const monitor = useBrowserMonitor();

  return (
    <>
      <PageHeading
        description="这里是软件替你做过的事：下载、点赞收藏和评论。"
        meta={`${tasks.length + records.length} 条`}
        title="动态"
      />
      <BoardTabs
        ariaLabel="动态分类"
        tabs={[
          {
            value: "downloads",
            label: "下载",
            icon: Download,
            count: tasks.length,
            content: (
              <TaskBoard
                loading={loading}
                onRetry={onRetryDownload}
                tasks={tasks}
              />
            ),
          },
          {
            value: "actions",
            label: "浏览操作",
            icon: History,
            count: monitor.tasks.length,
            content: <BrowseActions monitor={monitor} />,
          },
          {
            value: "extension",
            label: "插件下载",
            icon: Puzzle,
            count: records.length,
            content: <RecordBoard loading={loading} records={records} />,
          },
        ]}
      />
    </>
  );
}

function BrowseActions({
  monitor,
}: {
  monitor: ReturnType<typeof useBrowserMonitor>;
}) {
  // 全部记录来自同一连接方式时不必逐条标注。
  const drivers = new Set(monitor.tasks.map((task) => task.target_driver));

  return (
    <section aria-label="浏览操作">
      <p className="mb-4 text-xs leading-5 text-stone-500">
        点赞、收藏和评论的执行结果；不记录评论正文和页面内容。
      </p>
      {monitor.refreshing && !monitor.tasks.length ? (
        <SkeletonRecordList />
      ) : monitor.tasks.length ? (
        <div className="reading-column space-y-3">
          {monitor.tasks.map((task) => (
            <BrowserTaskRecord
              key={task.task_id}
              onResolve={(succeeded) =>
                void monitor.review(task.task_id, succeeded)
              }
              onRetry={() => void monitor.retry(task.task_id)}
              resolving={monitor.reviewingTaskId === task.task_id}
              showConnection={drivers.size > 1}
              retrying={monitor.retryingTaskId === task.task_id}
              task={task}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          description="点赞、收藏或评论之后，执行结果会显示在这里。"
          icon={History}
          title="还没有浏览操作"
        />
      )}
    </section>
  );
}
