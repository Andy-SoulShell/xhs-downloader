import { ImageOff } from "lucide-react";
import { useState } from "react";

interface MediaThumbnailProps {
  /** 预览地址；为空表示这条记录没有可用封面。 */
  src?: string | null;
  alt: string;
  /** 没有封面或加载失败时显示的备用内容。 */
  fallback: React.ReactNode;
}

/**
 * 列表中的封面缩略图。
 *
 * 小红书的媒体地址带签名且可能失效，因此必须处理加载失败：直接留一个
 * 破图会比没有图更糟。加载完成前保持占位底色，避免图片逐个弹入。
 */
export function MediaThumbnail({ src, alt, fallback }: MediaThumbnailProps) {
  const [state, setState] = useState<"loading" | "ready" | "failed">(src ? "loading" : "failed");

  // 没有封面时交还给备用内容自行呈现：套一层灰底会让彩色状态图标失色。
  if (!src) return <>{fallback}</>;

  if (state === "failed") {
    return (
      <span
        aria-hidden
        className="grid size-14 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-400"
        title="封面加载失败"
      >
        <ImageOff size={16} strokeWidth={1.75} />
      </span>
    );
  }

  return (
    // inline-block 不能省：span 默认是 inline，宽高会被忽略，里面 size-full 的
    // 图片就按原始尺寸铺开。在 flex 容器里恰好看不出来，换个地方就撑爆版面。
    <span className="relative inline-block size-14 shrink-0 overflow-hidden rounded-xl bg-stone-100 align-middle">
      <img
        alt={alt}
        className={`size-full object-cover transition-opacity duration-300 ${
          state === "ready" ? "opacity-100" : "opacity-0"
        }`}
        loading="lazy"
        onError={() => setState("failed")}
        onLoad={() => setState("ready")}
        // 本机素材这类小图常常在 React 挂上 onLoad 之前就从缓存里读完了，
        // 那一次 load 事件永远不会来，图片会一直停在透明的加载态。
        ref={(node) => {
          if (node?.complete) setState(node.naturalWidth ? "ready" : "failed");
        }}
        referrerPolicy="no-referrer"
        src={src}
      />
    </span>
  );
}
