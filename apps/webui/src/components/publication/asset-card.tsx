import { ChevronDown, ChevronUp, FileVideo2, GripVertical, Trash2 } from "lucide-react";
import type { DragEvent } from "react";

import type { PublicationAsset } from "../../lib/publication";
import { publicationAssetUrl } from "../../lib/publication-api";
import { ActionButton } from "../action-button";
import { Badge } from "../badge";
import { MediaThumbnail } from "../media-thumbnail";

interface PublicationAssetCardProps {
  asset: PublicationAsset;
  draftId: string;
  index: number;
  canMoveDown: boolean;
  canMoveUp: boolean;
  /** 正被拖动的素材，用于给落点描边。 */
  draggingId: string | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropBefore: () => void;
  onMoveDown: () => void;
  onMoveUp: () => void;
  onRemove: () => void;
}

/**
 * 素材网格里的一格。
 *
 * 首位就是封面，所以顺序不是排版偏好而是内容决策，得看得见拖得动。拖放
 * 之外保留上下移按钮：键盘和读屏用户走不了拖放这条路。
 */
export function PublicationAssetCard({
  asset,
  draftId,
  index,
  canMoveDown,
  canMoveUp,
  draggingId,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onMoveDown,
  onMoveUp,
  onRemove,
}: PublicationAssetCardProps) {
  const video = asset.media_type.startsWith("video/");
  const dragging = draggingId === asset.asset_id;
  const accept = (event: DragEvent) => {
    if (!draggingId || dragging) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-2xl border bg-white p-3 transition-colors ${
        dragging ? "border-stone-900 opacity-60" : "border-stone-200"
      } ${draggingId && !dragging ? "hover:border-stone-500" : ""}`}
      draggable
      onDragEnd={onDragEnd}
      onDragOver={accept}
      onDragStart={(event) => {
        // Firefox 不带数据的拖动根本不会开始。
        event.dataTransfer.setData("text/plain", asset.asset_id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDrop={(event) => {
        if (!draggingId || dragging) return;
        event.preventDefault();
        onDropBefore();
      }}
    >
      <GripVertical aria-hidden className="shrink-0 cursor-grab text-stone-400" size={15} />
      <MediaThumbnail
        alt=""
        fallback={
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500">
            <FileVideo2 aria-hidden size={17} />
          </span>
        }
        src={video ? null : publicationAssetUrl(draftId, asset.asset_id)}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-stone-800">{asset.filename}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {index === 0 && <Badge tone="dark">封面</Badge>}
          <Badge>{video ? "视频" : "图片"}</Badge>
          <span className="meta-text">{formatBytes(asset.size)}</span>
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
