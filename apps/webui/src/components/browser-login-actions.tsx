import { LogIn, QrCode, ShieldCheck, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { LoginQrCodeResult } from "../lib/types";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";

interface BrowserLoginActionsProps {
  busy: boolean;
  message: string;
  qrCode: LoginQrCodeResult | null;
  onCheckLogin: () => Promise<void>;
  onDeleteCookies: () => Promise<void>;
  onGetQrCode: () => Promise<void>;
}

/** 提供浏览器登录检查、扫码登录和站点 Cookie 清理入口。 */
export function BrowserLoginActions({
  busy,
  message,
  qrCode,
  onCheckLogin,
  onDeleteCookies,
  onGetQrCode,
}: BrowserLoginActionsProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const confirmDelete = async () => {
    await onDeleteCookies();
    setConfirmingDelete(false);
  };

  return (
    <section
      aria-label="浏览器登录与会话"
      className="control-shell mb-4 min-w-0 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="text-red-500" size={18} />
            <h2 className="text-sm font-semibold text-stone-900">
              浏览器登录与会话
            </h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-stone-500">
            扫码在真实小红书页面完成；扩展只清理站点 Cookie，不能读取其内容。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            disabled={busy}
            onClick={() => void onCheckLogin()}
            variant="outline"
          >
            <LogIn aria-hidden size={15} />
            检查登录
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() => void onGetQrCode()}
            variant="outline"
          >
            <QrCode aria-hidden size={15} />
            获取登录二维码
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            variant="ghost"
          >
            <Trash2 aria-hidden size={15} />
            清除浏览器 Cookie
          </ActionButton>
        </div>
      </div>

      {qrCode?.image_data_url && (
        <div className="mt-4 flex min-w-0 flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center">
          <img
            alt="小红书登录二维码"
            className="size-44 shrink-0 rounded-xl border border-stone-100 bg-white object-contain"
            src={qrCode.image_data_url}
          />
          <div className="min-w-0 text-xs leading-5 text-stone-500">
            <Badge tone="warning">等待扫码</Badge>
            <p className="mt-2">请使用小红书 App 扫码并在手机上确认登录。</p>
            <p>登录标签页会保持打开，二维码约在 {formatExpiry(qrCode.expires_at)} 失效。</p>
          </div>
        </div>
      )}

      {qrCode?.is_logged_in && (
        <div className="mt-4">
          <Badge tone="success">浏览器已经登录，无需扫码</Badge>
        </div>
      )}
      {message && (
        <div className="mt-4">
          <Badge tone="success">{message}</Badge>
        </div>
      )}

      {confirmingDelete && (
        <div
          aria-modal="true"
          className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
          role="alertdialog"
        >
          <p className="text-sm font-semibold text-stone-900">
            确认清除浏览器中的小红书 Cookie？
          </p>
          <p className="mt-1 text-xs leading-5 text-stone-600">
            这会退出浏览器登录，但不会修改 Cookie HTTP 模式的本地配置。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              <Trash2 aria-hidden size={14} />
              确认清除
            </ActionButton>
            <ActionButton
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
              variant="outline"
            >
              <X aria-hidden size={14} />
              取消
            </ActionButton>
          </div>
        </div>
      )}
    </section>
  );
}

function formatExpiry(value: string | null): string {
  if (!value) return "短时间内";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
