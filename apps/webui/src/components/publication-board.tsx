import { FilePlus2, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { describeError } from "../lib/error-message";
import { DRAFT_PAGE_LIMIT } from "../lib/publication-api";
import {
  type DraftStageFilter,
  filterDrafts,
  indexTasksByDraft,
  summarizeDrafts,
} from "../lib/publication-index";
import { usePublicationCenterContext } from "../lib/publication-center";
import { isBrowserDriver } from "../lib/types";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { BoardTabs } from "./board-tabs";
import { EmptyState } from "./empty-state";
import { PageHeading } from "./page-heading";
import { PublicationDraftList } from "./publication-draft-list";
import { PublicationEditor } from "./publication-editor";
import { PublicationTaskList } from "./publication-task-list";
import { PublicationTimeline } from "./publication-timeline";
import { SkeletonForm } from "./skeleton";

/** 组合草稿列表、草稿编辑与发布任务，并保管尚未提交的计划时间。 */
export function PublicationBoard({
  browserDriver,
  onNotify,
}: {
  browserDriver?: unknown;
  onNotify: (message: string) => void;
}) {
  const center = usePublicationCenterContext();
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [stage, setStage] = useState<DraftStageFilter>("all");
  const [listTab, setListTab] = useState("drafts");
  // 计划时间只存在于本次会话：后端草稿没有这个字段，攒在这里至少能做到
  // 切草稿、切工作台都不丢，卡片上也标得清清楚楚"未提交"。
  const [schedules, setSchedules] = useState<Record<string, string>>({});
  const confirmedDriver = isBrowserDriver(browserDriver) ? browserDriver : null;

  const summaries = useMemo(
    () => summarizeDrafts(center.drafts, center.tasks),
    [center.drafts, center.tasks],
  );
  const tasksByDraft = useMemo(() => indexTasksByDraft(center.tasks), [center.tasks]);
  const draftIds = useMemo(
    () => new Set(center.drafts.map((draft) => draft.draft_id)),
    [center.drafts],
  );
  const visibleDrafts = useMemo(
    () => filterDrafts(center.drafts, summaries, { keyword, stage }),
    [center.drafts, keyword, stage, summaries],
  );
  // 只认整份草稿列表，不认筛选结果：左栏是导航，打开哪一份由点击决定。
  // 跟着筛选结果走的话，搜索框里敲一个字就会把正在编辑的内容换掉。
  const resolvedId = center.drafts.some((draft) => draft.draft_id === selectedId)
    ? selectedId
    : (center.drafts[0]?.draft_id ?? "");
  const selected = center.drafts.find((draft) => draft.draft_id === resolvedId);

  const createDraft = async () => {
    setCreating(true);
    try {
      const draft = await center.createDraft();
      setSelectedId(draft.draft_id);
      setKeyword("");
      setStage("all");
      setListTab("drafts");
      onNotify("已新建发布草稿");
    } catch (error) {
      onNotify(describeError(error, "草稿创建失败"));
    } finally {
      setCreating(false);
    }
  };
  const openDraft = (draftId: string) => {
    setSelectedId(draftId);
    setKeyword("");
    setStage("all");
    setListTab("drafts");
  };
  const taskAction = async (operation: () => Promise<unknown>, message: string) => {
    try {
      await operation();
      onNotify(message);
    } catch (error) {
      onNotify(describeError(error, "任务操作失败"));
    }
  };
  const taskHandlers = {
    onCancel: (taskId: string) => taskAction(() => center.cancelTask(taskId), "发布任务已取消"),
    onResumeVerification: async (taskId: string) => {
      try {
        await center.resumeVerification(taskId);
        onNotify("已确认验证完成，原发布任务正在继续");
      } catch (error) {
        onNotify(describeError(error, "验证恢复请求失败"));
        throw error;
      }
    },
    onRetry: (taskId: string) => taskAction(() => center.retryTask(taskId), "发布任务已重新就绪"),
    onReview: (taskId: string, published: boolean) =>
      taskAction(
        () => center.reviewTask(taskId, published),
        published ? "已确认作品发布成功" : "已确认作品未发布，现在可以重试",
      ),
  };

  if (!confirmedDriver) {
    return (
      <section aria-label="发布" className="mt-8 min-w-0">
        <PageHeading
          description="发布任务必须先确认使用浏览器扩展还是软件自带浏览器。"
          meta="等待配置"
          title="发布"
        />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.7fr)]">
          <EmptyState
            description="暂时无法确认发布方式，新建和提交已停用；已有任务仍可核对或恢复。"
            icon={Send}
            title="尚未确认浏览器模式"
          />
          <PublicationTaskList {...taskHandlers} tasks={center.tasks} />
        </div>
      </section>
    );
  }

  return (
    <section aria-label="发布" className="mt-8 min-w-0">
      <PageHeading
        actions={
          <ActionButton disabled={creating} onClick={() => void createDraft()} size="large">
            <FilePlus2 aria-hidden size={16} />
            {creating ? "正在创建…" : "新建草稿"}
          </ActionButton>
        }
        description={
          confirmedDriver === "managed"
            ? "由本地服务保存草稿，软件自带浏览器使用专用用户目录完成私密发布。"
            : "由本地服务保存草稿，浏览器扩展使用日常浏览器的已登录创作中心完成发布。"
        }
        meta={`${center.drafts.length} 份草稿 · ${center.tasks.length} 项任务`}
        title="发布"
      />

      {center.error && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <Badge tone="danger">连接异常</Badge>
          {center.error}
        </div>
      )}

      {!center.loading && !center.drafts.length ? (
        // 一份草稿都没有时不摆双栏：搜索、状态筛选和编辑器都无处落脚，
        // 两列各放一句"还没有发布草稿"只是把同一句话说两遍。
        <div className="space-y-5">
          <EmptyState
            action={
              <ActionButton disabled={creating} onClick={() => void createDraft()}>
                <FilePlus2 aria-hidden size={15} />
                新建第一份草稿
              </ActionButton>
            }
            description="准备标题、正文和本机素材后，可以一键发布或设置计划时间。"
            icon={Send}
            title="还没有发布草稿"
          />
          {center.tasks.length > 0 && (
            <PublicationTaskList {...taskHandlers} tasks={center.tasks} />
          )}
        </div>
      ) : (
        /* 左栏常驻、右侧编辑器并存：换一份草稿是一次点击，不再是展开下拉、
           在几十行截断文本里找、选中、等编辑器重挂载这四步。 */
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(300px,340px)_minmax(0,1fr)]">
          <BoardTabs
            ariaLabel="发布分类"
            onValueChange={setListTab}
            tabs={[
              {
                value: "drafts",
                label: "草稿",
                icon: FilePlus2,
                count: center.drafts.length,
                content: (
                  <PublicationDraftList
                    drafts={center.drafts}
                    keyword={keyword}
                    loading={center.loading}
                    onCreate={() => void createDraft()}
                    onKeywordChange={setKeyword}
                    onSelect={setSelectedId}
                    onStageChange={setStage}
                    schedules={schedules}
                    selectedId={resolvedId}
                    stage={stage}
                    summaries={summaries}
                    truncatedAt={
                      center.drafts.length >= DRAFT_PAGE_LIMIT ? DRAFT_PAGE_LIMIT : undefined
                    }
                    visibleDrafts={visibleDrafts}
                  />
                ),
              },
              {
                value: "tasks",
                label: "发布任务",
                icon: Send,
                count: center.tasks.length,
                content: (
                  <PublicationTaskList
                    {...taskHandlers}
                    draftIds={draftIds}
                    onOpenDraft={openDraft}
                    tasks={center.tasks}
                  />
                ),
              },
            ]}
            value={listTab}
          />

          {selected ? (
            <section aria-label="草稿编辑" className="control-shell min-w-0 p-5 xl:mt-[3.25rem]">
              <PublicationEditor
                browserDriver={confirmedDriver}
                draft={selected}
                // 这个 key 是草稿之间自动保存基线的隔离手段，删掉会让上一份
                // 草稿的基线漏进下一份。
                key={`${selected.draft_id}:${confirmedDriver}`}
                onDelete={() => center.deleteDraft(selected.draft_id)}
                onNotify={onNotify}
                onRemoveAsset={async (assetId) => {
                  await center.removeAsset(selected.draft_id, assetId);
                }}
                onSave={(input) => center.saveDraft(selected.draft_id, input)}
                onScheduledAtChange={(value) =>
                  setSchedules((current) => ({ ...current, [selected.draft_id]: value }))
                }
                onSubmitManual={() => center.submitTask(selected.draft_id, "manual")}
                onSubmitPlatformScheduled={(scheduledAt) =>
                  center.submitTask(selected.draft_id, "platform_scheduled", scheduledAt)
                }
                onSubmitScheduled={(scheduledAt) =>
                  center.submitTask(selected.draft_id, "scheduled", scheduledAt)
                }
                onUpload={(file) => center.uploadAsset(selected.draft_id, file).then(() => {})}
                scheduledAt={schedules[selected.draft_id] ?? ""}
                timeline={
                  <PublicationTimeline
                    {...taskHandlers}
                    tasks={tasksByDraft.get(selected.draft_id) ?? []}
                  />
                }
              />
            </section>
          ) : (
            <div className="control-shell min-w-0 p-5 xl:mt-[3.25rem]">
              <SkeletonForm fields={4} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
