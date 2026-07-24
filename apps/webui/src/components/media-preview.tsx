import { useRef, useState } from "react";
import { Maximize2 } from "lucide-react";

import type { MediaResource } from "../lib/types";

interface MediaPreviewProps {
  ariaLabel?: string;
  index: number;
  resources: MediaResource[];
  title: string;
  onOpen: () => void;
}

export function MediaPreview({
  ariaLabel,
  index,
  resources,
  title,
  onOpen,
}: MediaPreviewProps) {
  const liveVideo = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const image = resources.find((item) => item.类型 === "图片");
  const live = resources.find((item) => item.类型 === "动态图片");
  const video = resources.find((item) => item.类型 === "视频");

  const play = () => {
    if (!liveVideo.current) return;
    setPlaying(true);
    void liveVideo.current.play().catch(() => setPlaying(false));
  };

  const pause = () => {
    if (!liveVideo.current) return;
    liveVideo.current.pause();
    liveVideo.current.currentTime = 0;
    setPlaying(false);
  };

  if (image) {
    return (
      <div
        aria-label={ariaLabel ?? `查看第 ${index} 项大图`}
        className="relative w-full cursor-zoom-in"
        onClick={onOpen}
        onKeyDown={(event) => {
          if (
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            onOpen();
          }
        }}
        onMouseEnter={live ? play : undefined}
        onMouseLeave={live ? pause : undefined}
        role="button"
        tabIndex={0}
      >
        <img
          alt={`${title}的第 ${index} 张图片`}
          className="block h-auto w-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
          src={image.地址}
        />
        {live && (
          <>
            <video
              aria-label={`${title}的第 ${index} 个动态图片预览`}
              className={`absolute inset-0 size-full bg-stone-950 object-contain transition-opacity duration-200 ${
                playing ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
              loop
              muted
              playsInline
              preload="metadata"
              ref={liveVideo}
              src={live.地址}
            />
            <button
              aria-pressed={playing}
              className={`absolute bottom-2.5 left-2.5 rounded-full px-2 py-1 text-[10px] font-medium text-white backdrop-blur ${
                playing ? "bg-red-500/90" : "bg-stone-950/75"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                if (playing) pause();
                else play();
              }}
              type="button"
            >
              动态图片
            </button>
          </>
        )}
        <span
          aria-hidden
          className="absolute right-2.5 bottom-2.5 grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <Maximize2 size={13} strokeWidth={2} />
        </span>
      </div>
    );
  }

  return (
    <button
      aria-label={ariaLabel ?? `查看第 ${index} 项视频大图`}
      className="relative block w-full cursor-zoom-in"
      onClick={onOpen}
      type="button"
    >
      <video
        aria-label={`${title}的第 ${index} 个视频`}
        className="block h-auto w-full bg-stone-950 object-contain"
        muted
        playsInline
        poster={video?.预览地址 ?? undefined}
        preload="metadata"
        src={(video ?? live)?.地址}
      />
      <span
        aria-hidden
        className="absolute right-2.5 bottom-2.5 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
      >
        <Maximize2 size={13} strokeWidth={2} />
      </span>
    </button>
  );
}
