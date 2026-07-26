import { Power, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import {
  detectDesktopService,
  restartDesktopService,
  shutdownDesktopService,
  waitForServiceReady,
} from "../lib/desktop-api";
import { ActionButton } from "./action-button";

interface DesktopServiceControlProps {
  /** 是否有配置需要重启才能生效；为真时突出显示重启入口。 */
  restartRequired?: boolean;
  /** 重启完成后重新读取配置，使界面与新的运行状态一致。 */
  onRestarted?: () => void;
}

/** 仅在一体化桌面包中显示重启与安全退出入口。 */
export function DesktopServiceControl({
  restartRequired = false,
  onRestarted,
}: DesktopServiceControlProps = {}) {
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState<"restart" | "shutdown" | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // 只同步一次当前外部服务形态；开发 API 返回 404 时不显示这些入口。
    let active = true;
    void detectDesktopService().then((detected) => {
      if (active) setAvailable(detected);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!available) return null;

  const restart = async () => {
    setBusy("restart");
    setMessage("正在重启，请稍候…");
    try {
      await restartDesktopService();
      const ready = await waitForServiceReady();
      setMessage(
        ready
          ? "已重启，全部配置都已生效。"
          : "重启用时较长，请刷新页面确认服务状态。",
      );
      if (ready) onRestarted?.();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "本地服务重启失败");
    } finally {
      setBusy(null);
    }
  };

  const shutdown = async () => {
    if (!window.confirm("确认关闭本地服务和受管浏览器吗？")) return;
    setBusy("shutdown");
    try {
      setMessage(await shutdownDesktopService());
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "本地服务关闭失败");
      setBusy(null);
    }
  };

  return (
    <section
      aria-label="桌面服务"
      className="control-shell mt-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0 text-sm text-stone-600">
        <p className="font-semibold text-stone-900">本地服务</p>
        <p className="mt-1 text-xs leading-5">
          {message ||
            (restartRequired
              ? "有配置需要重启才能生效，现在就可以重启。"
              : "关闭前会停止后台任务并安全退出浏览器。")}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <ActionButton
          disabled={busy !== null}
          onClick={() => void restart()}
          variant={restartRequired ? "primary" : "outline"}
        >
          <RotateCw
            aria-hidden
            className={busy === "restart" ? "animate-spin" : ""}
            size={15}
          />
          {busy === "restart" ? "正在重启…" : "重启服务"}
        </ActionButton>
        <ActionButton
          disabled={busy !== null}
          onClick={() => void shutdown()}
          variant="outline"
        >
          <Power aria-hidden size={15} />
          {busy === "shutdown" ? "正在关闭…" : "关闭服务"}
        </ActionButton>
      </div>
    </section>
  );
}
