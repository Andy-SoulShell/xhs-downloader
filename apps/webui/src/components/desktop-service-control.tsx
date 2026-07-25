import { Power } from "lucide-react";
import { useEffect, useState } from "react";

import {
  detectDesktopService,
  shutdownDesktopService,
} from "../lib/desktop-api";
import { ActionButton } from "./action-button";

/** 仅在一体化桌面包中显示安全退出入口。 */
export function DesktopServiceControl() {
  const [available, setAvailable] = useState(false);
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // 只同步一次当前外部服务形态；开发 API 返回 404 时不显示退出入口。
    let active = true;
    void detectDesktopService().then((detected) => {
      if (active) setAvailable(detected);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  const shutdown = async () => {
    if (!window.confirm("确认关闭本地服务和受管浏览器吗？")) return;
    setClosing(true);
    try {
      setMessage(await shutdownDesktopService());
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "本地服务关闭失败");
      setClosing(false);
    }
  };

  return (
    <section
      aria-label="桌面服务"
      className="control-shell mt-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 text-sm text-stone-600">
        <p className="font-semibold text-stone-900">桌面服务</p>
        <p className="mt-1 text-xs leading-5">
          {message || "关闭前会停止后台任务并安全退出受管浏览器。"}
        </p>
      </div>
      <ActionButton
        disabled={closing}
        onClick={() => void shutdown()}
        variant="outline"
      >
        <Power aria-hidden size={15} />
        {closing ? "正在关闭…" : "关闭本地服务"}
      </ActionButton>
    </section>
  );
}
