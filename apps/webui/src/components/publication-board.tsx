import { FilePlus2, Send } from "lucide-react";
import { useState } from "react";

import { usePublicationCenter } from "../lib/use-publication-center";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { EmptyState } from "./empty-state";
import { PageHeading } from "./page-heading";
import { PublicationEditor } from "./publication-editor";
import { PublicationTaskList } from "./publication-task-list";

export function PublicationBoard({
  onNotify,
}: {
  onNotify: (message: string) => void;
}) {
  const center = usePublicationCenter();
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);

  const resolvedId = center.drafts.some(
    (draft) => draft.draft_id === selectedId,
  )
    ? selectedId
    : (center.drafts[0]?.draft_id ?? "");
  const selected = center.drafts.find(
    (draft) => draft.draft_id === resolvedId,
  );
  const createDraft = async () => {
    setCreating(true);
    try {
      const draft = await center.createDraft();
      setSelectedId(draft.draft_id);
      onNotify("已新建发布草稿");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "草稿创建失败");
    } finally {
      setCreating(false);
    }
  };
  const taskAction = async (
    operation: () => Promise<unknown>,
    message: string,
  ) => {
    try {
      await operation();
      onNotify(message);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "任务操作失败");
    }
  };

  return (
    <section aria-label="发布中心" className="mt-8 min-w-0">
      <PageHeading
        actions={
          <ActionButton
            disabled={creating}
            onClick={() => void createDraft()}
            size="large"
          >
            <FilePlus2 aria-hidden size={16} />
            {creating ? "正在创建…" : "新建草稿"}
          </ActionButton>
        }
        description="由本地服务保存草稿和排期，浏览器扩展使用普通账号的已登录创作中心完成发布。"
        meta={`${center.drafts.length} 份草稿 · ${center.tasks.length} 项任务`}
        title="发布中心"
      />

      {center.error && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          <Badge tone="danger">连接异常</Badge>
          {center.error}
        </div>
      )}

      {center.loading && !center.drafts.length ? (
        <EmptyState
          description="正在读取本地草稿、素材与发布任务。"
          icon={Send}
          title="正在加载发布中心"
        />
      ) : !center.drafts.length ? (
        <EmptyState
          action={
            <ActionButton onClick={() => void createDraft()}>
              <FilePlus2 aria-hidden size={15} />
              新建第一份草稿
            </ActionButton>
          }
          description="准备标题、正文和本地素材后，可以一键发布或设置计划时间。"
          icon={Send}
          title="还没有发布草稿"
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,0.7fr)]">
          <section className="control-shell min-w-0 p-5" aria-label="草稿编辑">
            <label className="mb-5 block text-xs font-semibold text-stone-700">
              当前草稿
              <select
                className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-normal text-stone-900 outline-none"
                onChange={(event) => setSelectedId(event.target.value)}
                value={resolvedId}
              >
                {center.drafts.map((draft) => (
                  <option key={draft.draft_id} value={draft.draft_id}>
                    {draft.title || "未命名草稿"} · {draft.assets.length} 项素材
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <PublicationEditor
                draft={selected}
                key={selected.draft_id}
                onDelete={() => center.deleteDraft(selected.draft_id)}
                onNotify={onNotify}
                onRemoveAsset={async (assetId) => {
                  await center.removeAsset(selected.draft_id, assetId);
                }}
                onSave={(input) => center.saveDraft(selected.draft_id, input)}
                onSubmitManual={() =>
                  center.submitTask(selected.draft_id, "manual")
                }
                onSubmitPlatformScheduled={(scheduledAt) =>
                  center.submitTask(
                    selected.draft_id,
                    "platform_scheduled",
                    scheduledAt,
                  )
                }
                onSubmitScheduled={(scheduledAt) =>
                  center.submitTask(
                    selected.draft_id,
                    "scheduled",
                    scheduledAt,
                  )
                }
                onUpload={async (files) => {
                  for (const file of files) {
                    await center.uploadAsset(selected.draft_id, file);
                  }
                }}
              />
            )}
          </section>
          <PublicationTaskList
            onCancel={(taskId) =>
              taskAction(() => center.cancelTask(taskId), "发布任务已取消")
            }
            onRetry={(taskId) =>
              taskAction(() => center.retryTask(taskId), "发布任务已重新就绪")
            }
            onReview={(taskId, published) =>
              taskAction(
                () => center.reviewTask(taskId, published),
                published
                  ? "已确认作品发布成功"
                  : "已确认作品未发布，现在可以重试",
              )
            }
            tasks={center.tasks}
          />
        </div>
      )}
    </section>
  );
}
