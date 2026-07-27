import { CheckCircle2, Copy, Puzzle, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";

import { extensionGuideMode } from "../lib/extension-install-guide";
import type { BrowserDriver } from "../lib/types";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";

const MANAGEMENT_PAGES = [
  { browser: "Chrome", address: "chrome://extensions" },
  { browser: "Edge", address: "edge://extensions" },
] as const;

/** 为普通用户展示扩展加载步骤和连接结果。 */
export function ExtensionInstallGuide({
  browserDriver,
  onlineCount,
  onRefresh,
  refreshing,
}: {
  browserDriver: BrowserDriver | null;
  onlineCount: number;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const mode = extensionGuideMode(browserDriver, onlineCount);

  if (mode === "hidden") return null;
  if (mode === "connected") {
    return (
      <section
        aria-label="浏览器扩展安装与连接"
        className="control-shell mt-6 flex min-w-0 flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-start gap-3">
          <CheckCircle2 aria-hidden className="mt-0.5 shrink-0 text-emerald-600" size={18} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900">浏览器扩展已连接</p>
            <p className="mt-1 break-words text-xs leading-5 text-stone-600">
              扩展不会读取或上传浏览器 Cookie，只执行你明确发起的小红书任务。
            </p>
          </div>
        </div>
        <Badge tone="success">{onlineCount} 个实例在线</Badge>
      </section>
    );
  }

  const copyAddress = async (browser: string, address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopyMessage(`已复制 ${browser} 扩展管理地址`);
    } catch {
      setCopyMessage("复制失败，请手动选择并复制上方地址");
    }
  };

  return (
    <section aria-label="浏览器扩展安装与连接" className="control-shell mt-6 min-w-0 p-4 sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-600">
          <Puzzle aria-hidden size={17} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-stone-900">加载浏览器扩展</h2>
            <Badge tone="warning">尚未连接</Badge>
          </div>
          <p className="mt-1 break-words text-xs leading-5 text-stone-600">
            Chrome 和 Edge 均可使用，首次加载只需完成下面四步。
          </p>
        </div>
      </div>

      <ol className="mt-4 grid min-w-0 gap-3 text-xs leading-5 text-stone-600 sm:grid-cols-2">
        <GuideStep index={1}>
          解压发行目录中的扩展 ZIP，保留解压后的
          <code className="mx-1 break-all text-stone-800">xhs-downloader-extension</code>
          文件夹。
        </GuideStep>
        <GuideStep index={2}>打开 Chrome 或 Edge 的扩展管理页，并开启“开发者模式”。</GuideStep>
        <GuideStep index={3}>点击“加载已解压的扩展程序”，选择第一步得到的文件夹。</GuideStep>
        <GuideStep index={4}>等待扩展完成登记，然后返回本页刷新连接状态。</GuideStep>
      </ol>

      <div className="mt-4 grid min-w-0 gap-2 sm:grid-cols-2">
        {MANAGEMENT_PAGES.map((page) => (
          <button
            aria-label={`复制 ${page.browser} 扩展管理地址`}
            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-left text-xs text-stone-600 transition hover:border-stone-300"
            key={page.address}
            onClick={() => void copyAddress(page.browser, page.address)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block font-medium text-stone-800">{page.browser} 扩展管理页</span>
              <code className="block break-all text-[11px] text-stone-600">{page.address}</code>
            </span>
            <Copy aria-hidden className="shrink-0" size={14} />
          </button>
        ))}
      </div>

      <div className="mt-4 flex min-w-0 flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="min-w-0 break-words text-xs leading-5 text-stone-600">
          扩展不会读取或上传浏览器 Cookie；登录信息始终留在你的浏览器中。
        </p>
        <ActionButton disabled={refreshing} onClick={() => void onRefresh()} variant="outline">
          <RefreshCw aria-hidden className={refreshing ? "animate-spin" : ""} size={14} />
          {refreshing ? "刷新中" : "已加载，刷新状态"}
        </ActionButton>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 break-words text-xs text-stone-600">
        {copyMessage}
      </p>
    </section>
  );
}

function GuideStep({ children, index }: { children: ReactNode; index: number }) {
  return (
    <li className="flex min-w-0 items-start gap-2 rounded-xl bg-stone-50 p-3">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-stone-200 text-[11px] font-semibold text-stone-700">
        {index}
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}
