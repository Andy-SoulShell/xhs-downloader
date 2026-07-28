import { FileVideo2 } from "lucide-react";

import { formatFullTime } from "../../lib/format-time";
import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationTask,
} from "../../lib/publication";
import { publicationAssetUrl } from "../../lib/publication-api";
import { type DraftSummary, draftStageLabel, draftTitle } from "../../lib/publication-index";
import { usePublicationSubmit } from "../../lib/use-publication-submit";
import type { BrowserDriver } from "../../lib/types";
import { Badge } from "../badge";
import { DialogShell } from "../dialog-shell";
import { MediaThumbnail } from "../media-thumbnail";
import { PublicationSubmitControls } from "./submit-controls";

const VISIBILITY_LABELS = {
  public: "公开可见",
  private: "仅自己可见",
  mutual: "仅互关好友可见",
} as const;

interface PublicationDraftDialogProps {
  browserDriver: BrowserDriver;
  draft: PublicationDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 关闭后把焦点还给打开它的按钮。 */
  onRestoreFocus?: () => void;
  onNotify: (message: string) => void;
  onSave: (input: PublicationDraftInput) => Promise<PublicationDraft>;
  onScheduledAtChange: (scheduledAt: string) => void;
  onSubmitManual: () => Promise<PublicationTask>;
  onSubmitPlatformScheduled: (scheduledAt: string) => Promise<PublicationTask>;
  onSubmitScheduled: (scheduledAt: string) => Promise<PublicationTask>;
  scheduledAt: string;
  summary: DraftSummary;
}

/**
 * 草稿详情。
 *
 * 点开一份草稿先看到的是它本身，不是一屏输入框：内容只读呈现，发布这一步
 * 落在这里——发出去撤不回来，至少要先看一眼要发的是什么。改内容走编辑，
 * 看历史走记录，各自是独立的框。
 */
export function PublicationDraftDialog({
  browserDriver,
  draft,
  open,
  onOpenChange,
  onRestoreFocus,
  onNotify,
  onSave,
  onScheduledAtChange,
  onSubmitManual,
  onSubmitPlatformScheduled,
  onSubmitScheduled,
  scheduledAt,
  summary,
}: PublicationDraftDialogProps) {
  const stageLabel = draftStageLabel(summary);
  const submit = usePublicationSubmit({
    browserDriver,
    draft,
    onNotify,
    onSave,
    onSubmitManual,
    onSubmitPlatformScheduled,
    onSubmitScheduled,
    scheduledAt,
  });

  return (
    <DialogShell
      description={`更新于 ${formatFullTime(draft.updated_at)}`}
      footer={
        <PublicationSubmitControls
          blockers={submit.blockers}
          browserDriver={browserDriver}
          busy={submit.busy}
          onScheduledAtChange={onScheduledAtChange}
          onSubmit={submit.submit}
          products={browserDriver === "managed" ? [] : draft.products}
          scheduledAt={scheduledAt}
        />
      }
      meta={stageLabel ? <Badge tone="neutral">{stageLabel}</Badge> : undefined}
      onOpenChange={onOpenChange}
      onRestoreFocus={onRestoreFocus}
      open={open}
      title={draftTitle(draft)}
      width="max-w-3xl"
    >
      {draft.assets.length > 0 && (
        <ul aria-label="发布素材" className="mb-5 flex flex-wrap gap-2">
          {draft.assets.map((asset, index) => (
            <li className="relative" key={asset.asset_id}>
              <MediaThumbnail
                alt={asset.filename}
                fallback={
                  <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500">
                    <FileVideo2 aria-hidden size={17} />
                  </span>
                }
                src={
                  asset.media_type.startsWith("video/")
                    ? null
                    : publicationAssetUrl(draft.draft_id, asset.asset_id)
                }
              />
              {index === 0 && (
                <Badge className="absolute bottom-1 left-1" size="compact" tone="overlay">
                  封面
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      {draft.body ? (
        <p className="text-sm leading-6 whitespace-pre-wrap text-stone-800">{draft.body}</p>
      ) : (
        <p className="text-sm leading-6 text-stone-500">还没有写正文。</p>
      )}

      {draft.tags.length > 0 && (
        <p className="mt-4 flex flex-wrap gap-1.5">
          {draft.tags.map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </p>
      )}

      <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-stone-200 pt-4 text-xs leading-5 sm:grid-cols-2">
        <Row label="可见范围" value={VISIBILITY_LABELS[draft.visibility]} />
        <Row label="原创声明" value={draft.is_original ? "已声明" : "未声明"} />
        <Row
          label="素材"
          value={draft.assets.length ? `${draft.assets.length} 项` : "还没有素材"}
        />
        {browserDriver === "extension" && (
          <Row label="绑定商品" value={draft.products.length ? draft.products.join("、") : "无"} />
        )}
      </dl>
    </DialogShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="shrink-0 text-stone-500">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-stone-800">{value}</dd>
    </div>
  );
}
