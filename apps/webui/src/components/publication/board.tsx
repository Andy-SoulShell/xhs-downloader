import { FilePlus2, Send } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { describeError } from "../../lib/error-message";
import { DRAFT_PAGE_LIMIT } from "../../lib/publication-api";
import { usePublicationCenterContext } from "../../lib/publication-center";
import {
  type DraftStageFilter,
  filterDrafts,
  indexTasksByDraft,
  summarizeDrafts,
} from "../../lib/publication-index";
import { isBrowserDriver } from "../../lib/types";
import { ActionButton } from "../action-button";
import { Badge } from "../badge";
import { BoardTabs } from "../board-tabs";
import { EmptyState } from "../empty-state";
import { PageHeading } from "../page-heading";
import { PublicationDraftDialog } from "./draft-dialog";
import { PublicationDraftList } from "./draft-list";
import { PublicationEditorDialog } from "./editor-dialog";
import { PublicationRecordsDialog } from "./records-dialog";
import { PublicationTaskList } from "./task-list";

/** 同一时刻只开一个框：详情、编辑、记录是同层的三个去处，不叠在一起。 */
type OpenDialog = { draftId: string; view: "detail" | "edit" | "records" } | null;

/** 组合草稿箱、发布任务与三个对话框，并保管尚未提交的计划时间。 */
export function PublicationBoard({
  browserDriver,
  onNotify,
}: {
  browserDriver?: unknown;
  onNotify: (message: string) => void;
}) {
  const center = usePublicationCenterContext();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [creating, setCreating] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [stage, setStage] = useState<DraftStageFilter>("all");
  // 计划时间只存在于本次会话：后端草稿没有这个字段，攒在这里至少能做到
  // 切草稿、切工作台都不丢，卡片上也标得清清楚楚"未提交"。
  const [schedules, setSchedules] = useState<Record<string, string>>({});
  // 记下是谁打开的框，关掉之后焦点要回到那颗按钮。
  const opener = useRef<HTMLElement | null>(null);
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
  // 草稿被删掉时连同它的框一起收起，否则会停在一份不存在的草稿上。
  const active = dialog && center.drafts.find((draft) => draft.draft_id === dialog.draftId);

  const openDialog = (draftId: string, view: NonNullable<OpenDialog>["view"]) => {
    opener.current = document.activeElement as HTMLElement | null;
    setDialog({ draftId, view });
  };
  const restoreFocus = () => opener.current?.focus();
  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };

  const createDraft = async () => {
    setCreating(true);
    try {
      const draft = await center.createDraft();
      setKeyword("");
      setStage("all");
      openDialog(draft.draft_id, "edit");
      onNotify("已新建发布草稿");
    } catch (error) {
      onNotify(describeError(error, "草稿创建失败"));
    } finally {
      setCreating(false);
    }
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
        <div className="space-y-5">
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

      <BoardTabs
        ariaLabel="发布分类"
        tabs={[
          {
            value: "drafts",
            label: "草稿箱",
            icon: FilePlus2,
            count: center.drafts.length,
            content: (
              <PublicationDraftList
                drafts={center.drafts}
                keyword={keyword}
                loading={center.loading}
                onCreate={() => void createDraft()}
                onEdit={(draftId) => openDialog(draftId, "edit")}
                onKeywordChange={setKeyword}
                onOpen={(draftId) => openDialog(draftId, "detail")}
                onRecords={(draftId) => openDialog(draftId, "records")}
                onStageChange={setStage}
                schedules={schedules}
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
                onOpenDraft={(draftId) => openDialog(draftId, "detail")}
                tasks={center.tasks}
              />
            ),
          },
        ]}
      />

      {/* 同一时刻只渲染当前那一个框：三个都挂着的话，Radix 的焦点作用域会互相
          打架，切换视图也会多留两份不该存在的隐藏内容。 */}
      {active && dialog?.view === "detail" && (
        <PublicationDraftDialog
          browserDriver={confirmedDriver}
          draft={active}
          onNotify={onNotify}
          onOpenChange={closeDialog}
          onRestoreFocus={restoreFocus}
          onSave={(input) => center.saveDraft(active.draft_id, input)}
          onScheduledAtChange={(value) =>
            setSchedules((current) => ({ ...current, [active.draft_id]: value }))
          }
          onSubmitManual={() => center.submitTask(active.draft_id, "manual")}
          onSubmitPlatformScheduled={(scheduledAt) =>
            center.submitTask(active.draft_id, "platform_scheduled", scheduledAt)
          }
          onSubmitScheduled={(scheduledAt) =>
            center.submitTask(active.draft_id, "scheduled", scheduledAt)
          }
          open
          scheduledAt={schedules[active.draft_id] ?? ""}
          summary={summaries.get(active.draft_id) ?? EMPTY_SUMMARY}
        />
      )}
      {active && dialog?.view === "edit" && (
        <PublicationEditorDialog
          browserDriver={confirmedDriver}
          draft={active}
          // 这个 key 是草稿之间自动保存基线的隔离手段，删掉会让上一份
          // 草稿的基线漏进下一份。
          key={`${active.draft_id}:${confirmedDriver}`}
          onDelete={async () => {
            await center.deleteDraft(active.draft_id);
            setDialog(null);
          }}
          onNotify={onNotify}
          onOpenChange={closeDialog}
          onRemoveAsset={async (assetId) => {
            await center.removeAsset(active.draft_id, assetId);
          }}
          onRestoreFocus={restoreFocus}
          onSave={(input, options) => center.saveDraft(active.draft_id, input, options)}
          onUpload={(file) => center.uploadAsset(active.draft_id, file).then(() => {})}
          open
        />
      )}
      {active && dialog?.view === "records" && (
        <PublicationRecordsDialog
          {...taskHandlers}
          draft={active}
          onOpenChange={closeDialog}
          onRestoreFocus={restoreFocus}
          open
          tasks={tasksByDraft.get(active.draft_id) ?? []}
        />
      )}
    </section>
  );
}

const EMPTY_SUMMARY = {
  stage: "unsubmitted",
  attention: 0,
  total: 0,
  drifted: false,
} as const;
