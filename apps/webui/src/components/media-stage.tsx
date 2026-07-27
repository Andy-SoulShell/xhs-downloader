import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  mediaCover,
  mediaLabel,
  type MediaGroup,
} from "../lib/media";

interface MediaStageProps {
  activeIndex: number;
  current: MediaGroup;
  media: MediaGroup[];
  onMove: (step: number) => void;
  onSelect: (index: number) => void;
}

/**
 * 在帖子详情中完整展示当前媒体及切换控件。
 *
 * @param props 组件属性。
 * @param props.activeIndex 当前媒体的零基位置。
 * @param props.current 当前媒体组。
 * @param props.media 帖子的全部媒体组。
 * @param props.onMove 切换到前一项或后一项。
 * @param props.onSelect 选择指定媒体。
 * @returns 保持原始宽高比的详情媒体舞台。
 */
export function MediaStage({
  activeIndex,
  current,
  media,
  onMove,
  onSelect,
}: MediaStageProps) {
  const [aspectRatio, setAspectRatio] = useState(3 / 4);
  // 记住失败的地址而不是布尔值：切换到下一项时会自动恢复，无需额外重置。
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const image = current.resources.find((item) => item.类型 === "图片");
  const live = current.resources.find((item) => item.类型 === "动态图片");
  const video = current.resources.find((item) => item.类型 === "视频");
  const applyImageRatio = (element: HTMLImageElement) => {
    if (element.naturalWidth && element.naturalHeight) {
      setAspectRatio(element.naturalWidth / element.naturalHeight);
    }
  };
  const applyVideoRatio = (element: HTMLVideoElement) => {
    if (element.videoWidth && element.videoHeight) {
      setAspectRatio(element.videoWidth / element.videoHeight);
    }
  };

  return (
    <div
      className="relative grid min-h-[44vh] min-w-0 place-items-center overflow-hidden bg-stone-950 lg:h-full lg:min-h-0 lg:w-auto lg:max-w-[calc(96vw-400px)]"
      style={{ aspectRatio }}
    >
      {live ? (
        <video
          aria-label={`第 ${current.index} 项动态图片预览`}
          autoPlay
          className="absolute inset-0 size-full object-contain object-center"
          controls
          key={`${current.index}-live`}
          loop
          muted
          onLoadedMetadata={(event) => applyVideoRatio(event.currentTarget)}
          playsInline
          poster={image?.地址}
          src={live.地址}
        />
      ) : video ? (
        <video
          aria-label={`第 ${current.index} 项视频预览`}
          className="absolute inset-0 size-full object-contain object-center"
          controls
          key={`${current.index}-video`}
          onLoadedMetadata={(event) => applyVideoRatio(event.currentTarget)}
          playsInline
          poster={video.预览地址 ?? undefined}
          src={video.地址}
        />
      ) : image && failedSource === image.地址 ? (
        // 只留一片纯黑等于什么都没说：媒体地址带签名会过期，必须讲清楚。
        <p className="flex flex-col items-center gap-3 px-8 text-center text-sm text-stone-400">
          <ImageOff aria-hidden size={30} strokeWidth={1.25} />
          这一项的媒体地址已失效，重新解析帖子后可以再试。
        </p>
      ) : (
        <img
          alt={`第 ${current.index} 项图片预览`}
          className="absolute inset-0 size-full object-contain object-center"
          onError={() => setFailedSource(image?.地址 ?? null)}
          onLoad={(event) => applyImageRatio(event.currentTarget)}
          referrerPolicy="no-referrer"
          src={image?.地址}
        />
      )}

      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-black/65 to-transparent"
      />
      <span className="absolute top-4 left-4 z-20 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur">
        {activeIndex + 1} / {media.length} · {mediaLabel(current)}
      </span>
      {media.length > 1 && (
        <>
          <CarouselButton label="上一项" onClick={() => onMove(-1)} side="left">
            <ChevronLeft aria-hidden size={20} />
          </CarouselButton>
          <CarouselButton label="下一项" onClick={() => onMove(1)} side="right">
            <ChevronRight aria-hidden size={20} />
          </CarouselButton>
          <div className="absolute right-4 bottom-4 left-4 z-20 flex justify-center gap-2">
            {media.map((item, position) => {
              const cover = mediaCover(item);
              return (
                <button
                  aria-label={`查看第 ${item.index} 项`}
                  className={`relative size-12 overflow-hidden rounded-lg border-2 bg-stone-800 transition ${
                    position === activeIndex
                      ? "border-white shadow-lg"
                      : "border-white/25 opacity-70 hover:opacity-100"
                  }`}
                  key={item.index}
                  onClick={() => onSelect(position)}
                  type="button"
                >
                  {cover ? (
                    <img
                      alt=""
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                      src={cover}
                    />
                  ) : (
                    <span className="text-[10px] text-white">
                      {item.index}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function CarouselButton({
  children,
  label,
  onClick,
  side,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  side: "left" | "right";
}) {
  return (
    <button
      aria-label={label}
      className={`absolute top-1/2 z-20 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur transition hover:bg-white hover:text-stone-950 ${
        side === "left" ? "left-4" : "right-4"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
