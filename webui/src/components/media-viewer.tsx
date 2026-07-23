import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog } from "radix-ui";

import type { MediaResource } from "../lib/types";

interface MediaGroup {
  index: number;
  resources: MediaResource[];
}

interface MediaViewerProps {
  activeIndex: number;
  media: MediaGroup[];
  open: boolean;
  onIndexChange: (index: number) => void;
  onOpenChange: (open: boolean) => void;
}

export function MediaViewer({
  activeIndex,
  media,
  open,
  onIndexChange,
  onOpenChange,
}: MediaViewerProps) {
  const current = media[activeIndex];
  const move = useCallback(
    (step: number) => {
      onIndexChange((activeIndex + step + media.length) % media.length);
    },
    [activeIndex, media.length, onIndexChange],
  );

  useEffect(() => {
    if (!open || media.length < 2) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "ArrowRight") move(1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [media.length, move, open]);

  if (!current) return null;

  const image = current.resources.find((item) => item.类型 === "图片");
  const live = current.resources.find((item) => item.类型 === "动态图片");
  const video = current.resources.find((item) => item.类型 === "视频");
  const label = live ? "动态图片" : video ? "视频" : "图片";

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md" />
        <Dialog.Content className="fixed inset-2 z-50 overflow-hidden rounded-3xl border border-white/10 bg-black/95 text-white shadow-2xl outline-none sm:inset-5">
          <Dialog.Title className="sr-only">
            第 {activeIndex + 1} / {media.length} 项大图预览
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            使用左右方向键或画面两侧按钮切换媒体。
          </Dialog.Description>

          <div className="absolute top-4 left-4 z-20 rounded-full bg-black/55 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-md">
            第 {activeIndex + 1} / {media.length} 项 · {label}
          </div>
          <Dialog.Close
            aria-label="关闭"
            className="absolute top-4 right-4 z-20 grid size-10 place-items-center rounded-full bg-black/55 text-stone-200 shadow-lg outline-none backdrop-blur-md transition hover:bg-white hover:text-stone-950 focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <X aria-hidden size={18} strokeWidth={2} />
          </Dialog.Close>

          <div className="grid size-full place-items-center overflow-auto p-3 sm:p-5">
            {live ? (
              <video
                aria-label={`第 ${current.index} 项动态图片大图`}
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
                aria-label={`第 ${current.index} 项视频大图`}
                className="max-h-full max-w-full object-contain"
                controls
                key={`${current.index}-video`}
                playsInline
                poster={video.预览地址 ?? undefined}
                src={video.地址}
              />
            ) : (
              <img
                alt={`第 ${current.index} 项图片大图`}
                className="max-h-full max-w-full object-contain"
                referrerPolicy="no-referrer"
                src={image?.地址}
              />
            )}
          </div>

          <button
            aria-label="上一项"
            className="absolute top-1/2 left-3 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow-lg outline-none backdrop-blur-md transition hover:bg-white hover:text-stone-950 focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-0 sm:left-5"
            disabled={media.length < 2}
            onClick={() => move(-1)}
            type="button"
          >
            <ChevronLeft aria-hidden size={22} strokeWidth={2} />
          </button>
          <button
            aria-label="下一项"
            className="absolute top-1/2 right-3 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white shadow-lg outline-none backdrop-blur-md transition hover:bg-white hover:text-stone-950 focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-0 sm:right-5"
            disabled={media.length < 2}
            onClick={() => move(1)}
            type="button"
          >
            <ChevronRight aria-hidden size={22} strokeWidth={2} />
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
