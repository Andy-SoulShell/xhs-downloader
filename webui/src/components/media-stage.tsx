import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

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

export function MediaStage({
  activeIndex,
  current,
  media,
  onMove,
  onSelect,
}: MediaStageProps) {
  const image = current.resources.find((item) => item.类型 === "图片");
  const live = current.resources.find((item) => item.类型 === "动态图片");
  const video = current.resources.find((item) => item.类型 === "视频");

  return (
    <div className="relative grid min-h-[44vh] min-w-0 place-items-center overflow-hidden bg-stone-950 lg:min-h-0">
      {live ? (
        <video
          aria-label={`第 ${current.index} 项动态图片预览`}
          autoPlay
          className="max-h-full max-w-full object-contain"
          controls
          key={`${current.index}-live`}
          loop
          muted
          playsInline
          poster={image?.地址}
          src={live.地址}
        />
      ) : video ? (
        <video
          aria-label={`第 ${current.index} 项视频预览`}
          className="max-h-full max-w-full object-contain"
          controls
          key={`${current.index}-video`}
          playsInline
          poster={video.预览地址 ?? undefined}
          src={video.地址}
        />
      ) : (
        <img
          alt={`第 ${current.index} 项图片预览`}
          className="max-h-full max-w-full object-contain"
          referrerPolicy="no-referrer"
          src={image?.地址}
        />
      )}

      <span className="absolute top-4 left-4 rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
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
          <div className="absolute right-4 bottom-4 left-4 flex justify-center gap-2">
            {media.map((item, position) => {
              const cover = mediaCover(item);
              return (
                <button
                  aria-label={`查看第 ${item.index} 项`}
                  className={`relative size-12 overflow-hidden rounded-lg border-2 bg-stone-800 transition ${
                    position === activeIndex
                      ? "border-white"
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
      className={`absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-white hover:text-stone-950 ${
        side === "left" ? "left-4" : "right-4"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}
