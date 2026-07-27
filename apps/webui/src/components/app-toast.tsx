import { CheckCircle2, CircleAlert, Info } from "lucide-react";
import { Toast } from "radix-ui";

/** 提示语气；决定图标与配色，也决定停留时长。 */
export type NoticeTone = "success" | "error" | "info";

interface AppToastProps {
  message: string;
  tone: NoticeTone;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TONES = {
  success: {
    icon: CheckCircle2,
    accent: "text-emerald-600",
    ring: "border-emerald-200/80",
    // 成功只需被看见，不需要被阅读，可以走得快一些。
    duration: 3000,
  },
  error: {
    icon: CircleAlert,
    accent: "text-red-600",
    ring: "border-red-200/80",
    // 失败提示往往要读完整句并决定下一步，给足时间。
    duration: 6000,
  },
  info: {
    icon: Info,
    accent: "text-stone-600",
    ring: "border-stone-200",
    duration: 3600,
  },
} as const;

/**
 * 全局提示条。
 *
 * 此前成功与失败共用一张无差别的白卡片，用户要读完文字才知道发生了什么好事
 * 还是坏事。这里用图标和描边给出语气，并按语气区分停留时长。
 *
 * @param props 组件属性。
 * @param props.message 提示正文。
 * @param props.tone 提示语气。
 * @param props.open 是否展示。
 * @param props.onOpenChange 展示状态变化回调。
 * @returns 带语气的提示条。
 */
export function AppToast({ message, tone, open, onOpenChange }: AppToastProps) {
  const { icon: Icon, accent, ring, duration } = TONES[tone];
  return (
    <Toast.Root
      className={`flex items-start gap-2.5 rounded-2xl border bg-white p-4 shadow-2xl data-[state=open]:animate-[toast-in_180ms_ease-out] ${ring}`}
      duration={duration}
      onOpenChange={onOpenChange}
      open={open}
    >
      <Icon aria-hidden className={`mt-px shrink-0 ${accent}`} size={17} />
      <Toast.Title className="text-sm leading-6 font-semibold text-stone-900">
        {message}
      </Toast.Title>
    </Toast.Root>
  );
}
