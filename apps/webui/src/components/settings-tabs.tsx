import { Download, FolderTree, Globe, Plug, Server } from "lucide-react";

import type { AuthorMappingRow } from "../lib/author-mapping";
import type { SettingsResponse, SettingsValues } from "../lib/types";
import { AccessModeSettings } from "./access-mode-settings";
import type { BoardTab } from "./board-tabs";
import { PublicationSettings } from "./publication-settings";
import { ServiceSettings } from "./service-settings";
import {
  DownloadSettings,
  NetworkSettings,
  StorageSettings,
  type SettingsChange,
} from "./settings-sections";

/** 构造配置分组所需的全部回调与当前值。 */
export interface SettingsTabsInput {
  clearCookie: boolean;
  clearProxy: boolean;
  cookie: string;
  draft: SettingsValues;
  mappingRows: AuthorMappingRow[];
  proxy: string;
  settings: SettingsResponse;
  onChange: SettingsChange;
  onClearCookieChange: (value: boolean) => void;
  onClearProxyChange: (value: boolean) => void;
  onCookieChange: (value: string) => void;
  onMappingChange: (rows: AuthorMappingRow[]) => void;
  onProxyChange: (value: string) => void;
}

/**
 * 按用户目的划分配置分组。
 *
 * 配置项此前串成一页长滚动，桌面宽屏也要滚四屏以上才能看完；分组后
 * 每次只呈现一件事，顺序按使用频率从高到低排列。
 *
 * @param input 当前草稿值与各项变更回调。
 * @returns 可直接交给 `BoardTabs` 的分组定义。
 */
export function settingsTabs(input: SettingsTabsInput): BoardTab[] {
  const {
    clearCookie,
    clearProxy,
    cookie,
    draft,
    mappingRows,
    proxy,
    settings,
    onChange,
    onClearCookieChange,
    onClearProxyChange,
    onCookieChange,
    onMappingChange,
    onProxyChange,
  } = input;

  return [
    {
      value: "access",
      label: "连接方式",
      icon: Plug,
      content: <AccessModeSettings onChange={onChange} values={draft} />,
    },
    {
      value: "download",
      label: "下载",
      icon: Download,
      content: <DownloadSettings onChange={onChange} values={draft} />,
    },
    {
      value: "storage",
      label: "文件与目录",
      icon: FolderTree,
      content: (
        <StorageSettings
          mappingRows={mappingRows}
          onChange={onChange}
          onMappingChange={onMappingChange}
          values={draft}
        />
      ),
    },
    {
      value: "network",
      label: "网络与凭据",
      icon: Globe,
      content: (
        <NetworkSettings
          clearCookie={clearCookie}
          clearProxy={clearProxy}
          cookie={cookie}
          cookieConfigured={settings.cookie_configured}
          onChange={onChange}
          onClearCookieChange={onClearCookieChange}
          onClearProxyChange={onClearProxyChange}
          onCookieChange={onCookieChange}
          onProxyChange={onProxyChange}
          proxy={proxy}
          proxyConfigured={settings.proxy_configured}
          values={draft}
        />
      ),
    },
    {
      value: "service",
      label: "服务与发布",
      icon: Server,
      content: (
        <>
          <PublicationSettings onChange={onChange} values={draft} />
          <ServiceSettings onChange={onChange} values={draft} />
        </>
      ),
    },
  ];
}
