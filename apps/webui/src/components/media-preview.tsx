import { useRef, useState } from "react";
import { ImageOff, Maximize2 } from "lucide-react";

import type { MediaResource } from "../lib/types";

/**
 * 封面就位前预留的版面。
 *
 * 小红书封面比例集中在竖图，这里按 3:4 预留，让卡片在图片到达前就有稳定高度。
 */
const COVER_RESERVE = "aspect-3/4 w-full bg-stone-100";

/**
 * 封面加载失败时的占位。
 *
 * 小红书媒体地址带签名会过期，加载失败是常态而非边缘情况。占位必须自带高度，
 * 否则 `h-auto` 的图片失败后整个媒体区塌陷为零高度，卡片退化成纯文字行。
 *
 * @returns 保持封面区尺寸并说明失效原因的占位块。
 */
function CoverUnavailable() {
  return (
    <div className="grid aspect-3/4 w-full place-items-center bg-stone-100 text-stone-400">
      <span className="flex flex-col items-center gap-1.5">
        <ImageOff size={22} strokeWidth={1.5} />
        <span className="text-[11px] leading-none">封面已失效</span>
      </span>
    </div>
  );
}

interface MediaPreviewProps {
  ariaLabel?: string;
  index: number;
  resources: MediaResource[];
  title: string;
  onOpen: () => void;
}

/**
 * 展示帖子媒体的完整封面，并提供详情入口。
 *
 * @param props 组件属性。
 * @param props.ariaLabel 自定义无障碍名称。
 * @param props.index 一基媒体序号。
 * @param props.resources 同一媒体序号下的静态、动态或视频资源。
 * @param props.title 帖子标题。
 * @param props.onOpen 打开帖子详情的回调。
 * @returns 保持资源原始宽高比的媒体封面。
 */
export function MediaPreview({
  ariaLabel,
  index,
  resources,
  title,
  onOpen,
}: MediaPreviewProps) {
  const liveVideo = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  // 封面必须区分加载中与失败：地址不可达时请求会长时间挂起而不报错，
  // 只处理 onError 会让封面区无限期停在零高度，卡片看起来像坏掉了。
  const [coverState, setCoverState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
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
        {coverState === "failed" ? (
          <CoverUnavailable />
        ) : (
          <div className={coverState === "ready" ? "" : COVER_RESERVE}>
            <img
              alt={`${title}的第 ${index} 张图片`}
              className={`block h-auto w-full object-contain transition-opacity duration-300 ${
                coverState === "ready" ? "opacity-100" : "opacity-0"
              }`}
              loading="lazy"
              onError={() => setCoverState("failed")}
              onLoad={() => setCoverState("ready")}
              referrerPolicy="no-referrer"
              src={image.地址}
            />
          </div>
        )}
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
      {coverState === "failed" ? (
        <CoverUnavailable />
      ) : video?.预览地址 ? (
        <div className={coverState === "ready" ? "" : COVER_RESERVE}>
          <img
            alt={`${title}的第 ${index} 个视频封面`}
            className={`block h-auto w-full bg-stone-950 object-contain transition-opacity duration-300 ${
              coverState === "ready" ? "opacity-100" : "opacity-0"
            }`}
            loading="lazy"
            onError={() => setCoverState("failed")}
            onLoad={() => setCoverState("ready")}
            referrerPolicy="no-referrer"
            src={video.预览地址}
          />
        </div>
      ) : (
        <video
          aria-label={`${title}的第 ${index} 个视频`}
          className="block h-auto w-full bg-stone-950 object-contain"
          muted
          playsInline
          preload="metadata"
          src={(video ?? live)?.地址}
        />
      )}
      <span
        aria-hidden
        className="absolute right-2.5 bottom-2.5 grid size-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur"
      >
        <Maximize2 size={13} strokeWidth={2} />
      </span>
    </button>
  );
}
