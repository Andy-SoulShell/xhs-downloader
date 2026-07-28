import { ImagePlus, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";

import type { PublicationDraft } from "../../lib/publication";
import { IMAGE_LIMIT, planAssetIntake, type RejectedFile } from "../../lib/publication-intake";
import { useUploadQueue } from "../../lib/use-upload-queue";
import { EmptyState } from "../empty-state";
import { PublicationAssetCard } from "./asset-card";
import { PublicationUploadQueue } from "./upload-queue";

interface PublicationAssetsProps {
  /** 编辑器正在忙别的事，此时不接受改动。 */
  busy: boolean;
  draft: PublicationDraft;
  onMove: (assetOrder: string[]) => Promise<void>;
  onRemove: (assetId: string) => Promise<void>;
  onUpload: (file: File) => Promise<void>;
}

export function PublicationAssets({
  busy,
  draft,
  onMove,
  onRemove,
  onUpload,
}: PublicationAssetsProps) {
  const queue = useUploadQueue(onUpload);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    // 先按服务端同一套规则裁一遍：第 19 张图注定失败，不必发出去再挨一句报错。
    const plan = planAssetIntake(draft.assets, files);
    setRejected(plan.rejected);
    queue.enqueue(plan.accepted);
  };
  const reorder = async (assetId: string, targetIndex: number) => {
    const order = draft.assets.map((asset) => asset.asset_id);
    const from = order.indexOf(assetId);
    if (from < 0 || from === targetIndex) return;
    order.splice(from, 1);
    order.splice(from < targetIndex ? targetIndex - 1 : targetIndex, 0, assetId);
    await onMove(order);
  };
  const move = async (index: number, step: number) => {
    const target = index + step;
    if (target < 0 || target >= draft.assets.length) return;
    const order = draft.assets.map((asset) => asset.asset_id);
    [order[index], order[target]] = [order[target], order[index]];
    await onMove(order);
  };

  return (
    <fieldset className="space-y-3" disabled={busy}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <legend className="text-sm font-semibold text-stone-800">发布素材</legend>
          <p className="mt-1 text-xs text-stone-600">
            图文支持 1–{IMAGE_LIMIT} 张图片；视频笔记仅支持一个视频。第一项是封面。
          </p>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:border-stone-400">
          <Upload aria-hidden size={14} />
          添加素材
          <input
            accept="image/*,video/*"
            className="sr-only"
            multiple
            onChange={selectFiles}
            type="file"
          />
        </label>
      </div>

      {rejected.length > 0 && (
        <ul
          aria-label="没有添加的素材"
          className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900"
        >
          {rejected.map((item) => (
            <li key={item.filename}>
              {item.filename}：{item.reason}
            </li>
          ))}
        </ul>
      )}

      <PublicationUploadQueue queue={queue} />

      {draft.assets.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.assets.map((asset, index) => (
            <PublicationAssetCard
              asset={asset}
              canMoveDown={index < draft.assets.length - 1}
              canMoveUp={index > 0}
              draftId={draft.draft_id}
              draggingId={draggingId}
              index={index}
              key={asset.asset_id}
              onDragEnd={() => setDraggingId(null)}
              onDragStart={() => setDraggingId(asset.asset_id)}
              onDropBefore={() => {
                if (draggingId) void reorder(draggingId, index);
                setDraggingId(null);
              }}
              onMoveDown={() => void move(index, 1)}
              onMoveUp={() => void move(index, -1)}
              onRemove={() => void onRemove(asset.asset_id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          description="从本机选图片或视频，添加后可以拖动或用上下按钮调整顺序。"
          icon={ImagePlus}
          title="还没有添加素材"
        />
      )}
    </fieldset>
  );
}
