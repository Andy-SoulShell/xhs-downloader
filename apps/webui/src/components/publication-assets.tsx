import {
  ChevronDown,
  ChevronUp,
  FileImage,
  FileVideo2,
  Trash2,
  Upload,
} from "lucide-react";
import type { ChangeEvent } from "react";

import type {
  PublicationAsset,
  PublicationDraft,
} from "../lib/publication";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";

interface PublicationAssetsProps {
  busy: boolean;
  draft: PublicationDraft;
  onMove: (assetOrder: string[]) => Promise<void>;
  onRemove: (assetId: string) => Promise<void>;
  onUpload: (files: File[]) => Promise<void>;
}

export function PublicationAssets({
  busy,
  draft,
  onMove,
  onRemove,
  onUpload,
}: PublicationAssetsProps) {
  const selectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length) await onUpload(files);
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
          <legend className="text-sm font-semibold text-stone-800">
            发布素材
          </legend>
          <p className="mt-1 text-xs text-stone-500">
            图文支持 1–18 张图片；视频笔记仅支持一个视频。
          </p>
        </div>
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition hover:border-stone-400">
          <Upload aria-hidden size={14} />
          添加素材
          <input
            accept="image/*,video/*"
            className="sr-only"
            multiple
            onChange={(event) => void selectFiles(event)}
            type="file"
          />
        </label>
      </div>

      {draft.assets.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {draft.assets.map((asset, index) => (
            <AssetRow
              asset={asset}
              canMoveDown={index < draft.assets.length - 1}
              canMoveUp={index > 0}
              key={asset.asset_id}
              onMoveDown={() => void move(index, 1)}
              onMoveUp={() => void move(index, -1)}
              onRemove={() => void onRemove(asset.asset_id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/70 px-5 py-8 text-center text-sm text-stone-500">
          还没有素材。先添加图片或视频，再提交发布任务。
        </div>
      )}
    </fieldset>
  );
}

function AssetRow({
  asset,
  canMoveDown,
  canMoveUp,
  onMoveDown,
  onMoveUp,
  onRemove,
}: {
  asset: PublicationAsset;
  canMoveDown: boolean;
  canMoveUp: boolean;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
}) {
  const video = asset.media_type.startsWith("video/");
  const Icon = video ? FileVideo2 : FileImage;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-600">
        <Icon aria-hidden size={17} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-stone-800">
          {asset.filename}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Badge>{video ? "视频" : "图片"}</Badge>
          <span className="text-[11px] text-stone-400">
            {formatBytes(asset.size)}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <ActionButton
          aria-label={`上移 ${asset.filename}`}
          disabled={!canMoveUp}
          onClick={onMoveUp}
          size="icon"
          variant="ghost"
        >
          <ChevronUp aria-hidden size={14} />
        </ActionButton>
        <ActionButton
          aria-label={`下移 ${asset.filename}`}
          disabled={!canMoveDown}
          onClick={onMoveDown}
          size="icon"
          variant="ghost"
        >
          <ChevronDown aria-hidden size={14} />
        </ActionButton>
        <ActionButton
          aria-label={`删除 ${asset.filename}`}
          onClick={onRemove}
          size="icon"
          variant="ghost"
        >
          <Trash2 aria-hidden size={14} />
        </ActionButton>
      </div>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${value} B`;
}
