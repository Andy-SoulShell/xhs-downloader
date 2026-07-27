import type { SettingsResponse, SettingsUpdate } from "../lib/types";
import { isBrowserDriver } from "../lib/types";
import type { ManagedBrowserControl } from "../lib/use-managed-browser";
import { ConnectionPanel } from "./connection-panel";
import { PageHeading } from "./page-heading";
import { SettingsBoard } from "./settings-board";

interface SettingsWorkspaceProps {
  error: string;
  loading: boolean;
  managedBrowser: ManagedBrowserControl;
  saving: boolean;
  settings: SettingsResponse | null;
  onNotify: (message: string) => void;
  onRefresh: () => void;
  onSave: (values: SettingsUpdate) => Promise<SettingsResponse>;
}

/**
 * 设置工作台：连接方式、服务配置与本地服务控制。
 *
 * 页面标题必须排在最前：此前它在服务配置那一节里，于是受管浏览器和连接
 * 方式两块反而排在页面标题之前。标题也跟侧栏统一叫「设置」，不再一个叫
 * 设置一个叫服务配置。
 */
export function SettingsWorkspace({
  error,
  loading,
  managedBrowser,
  saving,
  settings,
  onNotify,
  onRefresh,
  onSave,
}: SettingsWorkspaceProps) {
  return (
    <>
      <PageHeading
        description="决定这个程序用什么方式打开小红书、文件下载到哪里，以及本地服务怎么跑。"
        meta=""
        title="设置"
      />
      <ConnectionPanel
        browserDriver={
          isBrowserDriver(settings?.values.browser_driver) ? settings.values.browser_driver : null
        }
        managedBrowser={managedBrowser}
      />
      <SettingsBoard
        error={error}
        loading={loading}
        onRefresh={onRefresh}
        onSave={onSave}
        onSaved={onNotify}
        saving={saving}
        settings={settings}
      />
    </>
  );
}
