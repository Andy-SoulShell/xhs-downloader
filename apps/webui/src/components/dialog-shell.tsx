import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 一句话说明这个框是干什么的，读屏用户靠它判断要不要进来。 */
  description: string;
  /** 标题右侧的次要信息，例如状态徽标。 */
  meta?: ReactNode;
  /** 常驻底部的操作区；正文滚动时不跟着滚走。 */
  footer?: ReactNode;
  children: ReactNode;
  /** 面板宽度类，默认适合表单阅读宽度。 */
  width?: string;
  /**
   * 关闭后把焦点还回去。
   *
   * Radix 只有在自带 `Dialog.Trigger` 时才知道该还给谁；这些框由外部状态
   * 控制，不自己还回去的话，键盘用户按一次 Esc 就被丢回文档开头。
   */
  onRestoreFocus?: () => void;
}

/**
 * 内容类对话框的外壳。
 *
 * 详情、编辑、记录是同一层级的三个框，共用一套结构：正文自己滚动，标题与
 * 底部操作常驻。焦点、Esc 与背景 aria-hidden 都交给 Radix Dialog，不再
 * 自己拿 div 假装弹框。
 */
export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  meta,
  footer,
  children,
  width = "max-w-2xl",
  onRestoreFocus,
}: DialogShellProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-[2px]" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            if (!onRestoreFocus) return;
            event.preventDefault();
            onRestoreFocus();
          }}
          className={`fixed top-1/2 left-1/2 z-50 flex max-h-[min(88vh,900px)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_24px_64px_rgb(28_25_23/0.18)] outline-none ${width}`}
        >
          <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-6 py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold text-stone-950">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-stone-600">
                {description}
              </Dialog.Description>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {meta}
              <Dialog.Close
                aria-label="关闭"
                className="grid size-9 place-items-center rounded-full text-stone-500 outline-none transition hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-4 focus-visible:ring-stone-900/[0.06]"
              >
                <X aria-hidden size={16} />
              </Dialog.Close>
            </div>
          </div>

          {/* 唯一的滚动容器：标题和底部操作留在视野里，长表单不会把保存按钮推走。 */}
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {footer && <div className="border-t border-stone-200 px-6 py-4">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
