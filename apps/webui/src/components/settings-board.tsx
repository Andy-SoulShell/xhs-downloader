import { CircleAlert, RotateCcw, Save, Settings2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

import type {
  SettingsResponse,
  SettingsUpdate,
} from "../lib/types";
import { ActionButton } from "./action-button";
import { Badge } from "./badge";
import { EmptyState } from "./empty-state";
import { PageHeading } from "./page-heading";
import { PublicationSettings } from "./publication-settings";
import {
  DownloadSettings,
  NetworkSettings,
  ServiceSettings,
  StorageSettings,
  type SettingsChange,
} from "./settings-sections";

interface SettingsBoardProps {
  error: string;
  loading: boolean;
  saving: boolean;
  settings: SettingsResponse | null;
  onRefresh: () => void;
  onSave: (values: SettingsUpdate) => Promise<SettingsResponse>;
  onSaved: (message: string) => void;
}

export function SettingsBoard({
  error,
  loading,
  saving,
  settings,
  onRefresh,
  onSave,
  onSaved,
}: SettingsBoardProps) {
  if (loading && !settings) {
    return (
      <section className="mt-8" aria-label="配置管理">
        <EmptyState
          description="正在从本地服务读取下次启动使用的配置。"
          icon={Settings2}
          title="正在读取配置"
        />
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="mt-8" aria-label="配置管理">
        <EmptyState
          description={error || "请确认本地服务已启动，并从本机打开管理后台。"}
          icon={CircleAlert}
          title="暂时无法读取配置"
        />
        <div className="mt-4 flex justify-center">
          <ActionButton onClick={onRefresh} variant="outline">
            <RotateCcw aria-hidden size={14} />
            重新读取
          </ActionButton>
        </div>
      </section>
    );
  }

  return (
    <SettingsForm
      error={error}
      onSave={onSave}
      onSaved={onSaved}
      saving={saving}
      settings={settings}
    />
  );
}

function SettingsForm({
  error,
  saving,
  settings,
  onSave,
  onSaved,
}: {
  error: string;
  saving: boolean;
  settings: SettingsResponse;
  onSave: (values: SettingsUpdate) => Promise<SettingsResponse>;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState(settings.values);
  const [mappingText, setMappingText] = useState(
    JSON.stringify(settings.values.mapping_data, null, 2),
  );
  const [cookie, setCookie] = useState("");
  const [proxy, setProxy] = useState("");
  const [clearCookie, setClearCookie] = useState(false);
  const [clearProxy, setClearProxy] = useState(false);
  const [formError, setFormError] = useState("");

  const change: SettingsChange = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const changeCookie = (value: string) => {
    setCookie(value);
    if (value) setClearCookie(false);
  };
  const changeProxy = (value: string) => {
    setProxy(value);
    if (value) setClearProxy(false);
  };
  const toggleClearCookie = (clear: boolean) => {
    setClearCookie(clear);
    if (clear) setCookie("");
  };
  const toggleClearProxy = (clear: boolean) => {
    setClearProxy(clear);
    if (clear) setProxy("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const mapping = parseMapping(mappingText);
      const payload: SettingsUpdate = { ...draft, mapping_data: mapping };
      if (cookie) payload.cookie = cookie;
      else if (clearCookie) payload.cookie = null;
      if (proxy) payload.proxy = proxy;
      else if (clearProxy) payload.proxy = null;
      const result = await onSave(payload);
      setDraft(result.values);
      setMappingText(JSON.stringify(result.values.mapping_data, null, 2));
      setCookie("");
      setProxy("");
      setClearCookie(false);
      setClearProxy(false);
      setFormError("");
      onSaved(
        result.restart_required
          ? "配置已保存，重启本地服务后生效"
          : "配置已保存",
      );
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "配置保存失败");
    }
  };

  const overridden = settings.overridden_fields
    .map((field) => settingLabels[field] || field)
    .join("、");

  return (
    <section aria-label="配置管理" className="mt-8 min-w-0">
      <PageHeading
        description="统一维护本地服务配置；Cookie 与代理只写入服务端配置文件，不会回传或保存到浏览器。"
        meta={settings.restart_required ? "等待重启生效" : "当前配置已生效"}
        title="服务配置"
      />

      {settings.restart_required && (
        <Notice tone="warning">
          已保存的配置与当前进程不同。现有任务继续使用启动时配置，重启服务后新配置才会生效。
        </Notice>
      )}
      {overridden && (
        <Notice tone="danger">
          以下字段被启动参数或进程环境覆盖：{overridden}。修改 .env
          可能不会改变这些字段的最终值。
        </Notice>
      )}
      {(error || formError) && (
        <Notice tone="danger">{formError || error}</Notice>
      )}

      <form className="space-y-5" onSubmit={(event) => void submit(event)}>
        <StorageSettings
          mappingText={mappingText}
          onChange={change}
          onMappingChange={setMappingText}
          values={draft}
        />
        <NetworkSettings
          clearCookie={clearCookie}
          clearProxy={clearProxy}
          cookie={cookie}
          cookieConfigured={settings.cookie_configured}
          onChange={change}
          onClearCookieChange={toggleClearCookie}
          onClearProxyChange={toggleClearProxy}
          onCookieChange={changeCookie}
          onProxyChange={changeProxy}
          proxy={proxy}
          proxyConfigured={settings.proxy_configured}
          values={draft}
        />
        <DownloadSettings onChange={change} values={draft} />
        <PublicationSettings onChange={change} values={draft} />
        <ServiceSettings onChange={change} values={draft} />

        <div className="control-shell flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs text-stone-500">
            <p className="font-medium text-stone-700">配置文件</p>
            <p className="mt-1 truncate font-mono text-[11px]">
              {settings.config_file}
            </p>
          </div>
          <ActionButton
            className="sm:min-w-36"
            disabled={saving}
            size="large"
            type="submit"
          >
            <Save aria-hidden size={16} />
            {saving ? "正在保存…" : "保存配置"}
          </ActionButton>
        </div>
      </form>
    </section>
  );
}

function Notice({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "danger" | "warning";
}) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-600">
      <Badge tone={tone}>{tone === "danger" ? "注意" : "待生效"}</Badge>
      <p>{children}</p>
    </div>
  );
}

function parseMapping(value: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("作者名称映射必须是有效 JSON");
  }
  if (
    !parsed ||
    Array.isArray(parsed) ||
    typeof parsed !== "object" ||
    Object.values(parsed).some((item) => typeof item !== "string")
  ) {
    throw new Error("作者名称映射必须是字符串键值对象");
  }
  return parsed as Record<string, string>;
}

const settingLabels: Record<string, string> = {
  work_path: "数据根目录",
  cookie: "Cookie",
  proxy: "代理",
  timeout: "请求超时",
  max_retry: "最大重试次数",
  max_concurrency: "最大并发数",
  server_host: "监听地址",
  server_port: "监听端口",
  log_level: "日志级别",
  publish_max_asset_size: "发布素材上限",
  publish_lease_seconds: "发布任务租约",
  browser_task_lease_seconds: "浏览器任务租约",
};
