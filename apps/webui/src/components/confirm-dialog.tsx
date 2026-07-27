import { AlertDialog } from "radix-ui";
import type { ReactNode } from "react";

import { ActionButton } from "./action-button";

interface ConfirmDialogProps {
  /** 打开对话框的按钮；由 Radix 接管点击并在关闭后把焦点还给它。 */
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** 不可撤销的操作置为真，确认按钮用危险外观。 */
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}

/**
 * 二次确认对话框。
 *
 * 全应用此前有三种确认方式并存：window.confirm、什么都不问、以及若干个
 * 自称 role="alertdialog" 的普通 div——焦点不会移入，Esc 关不掉，Tab 会
 * 径直走到框外面去。这里统一交给 Radix AlertDialog：焦点被困在框内、Esc
 * 可关、关闭后焦点回到触发按钮。
 */
export function ConfirmDialog({
  busy = false,
  confirmLabel,
  description,
  destructive = false,
  onConfirm,
  title,
  trigger,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-stone-950/40 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_24px_64px_rgb(28_25_23/0.18)]">
          <AlertDialog.Title className="text-base font-semibold text-stone-950">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div className="mt-2 text-sm leading-6 text-stone-600">{description}</div>
          </AlertDialog.Description>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <ActionButton disabled={busy} variant="outline">
                取消
              </ActionButton>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <ActionButton
                disabled={busy}
                onClick={onConfirm}
                variant={destructive ? "destructive" : "primary"}
              >
                {confirmLabel}
              </ActionButton>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
