import { useState } from "react";

import { detectAccessIntent, presetForIntent, type AccessIntent } from "../lib/access-intent";
import type { BrowserDriver, RouteStrategy, SettingsValues } from "../lib/types";
import { SelectSetting, SettingsSection, TextSetting } from "./setting-controls";
import type { SettingsChange } from "./settings-sections";

const routeOptions = [
  { label: "仅 Cookie + HTTP", value: "http_only" },
  { label: "仅浏览器", value: "browser_only" },
  { label: "HTTP 优先，失败后使用浏览器", value: "http_first" },
  { label: "浏览器优先，失败后使用 HTTP", value: "browser_first" },
];

const browserOptions = [
  { label: "浏览器扩展", value: "extension" },
  { label: "程序自带浏览器", value: "managed" },
];

const INTENTS: {
  value: AccessIntent;
  title: string;
  description: string;
}[] = [
  {
    value: "extension",
    title: "用我自己的浏览器",
    description: "装一个扩展，直接用你已经登录的小红书，不用重新扫码。",
  },
  {
    value: "managed",
    title: "用程序自带的浏览器",
    description: "不用装扩展，第一次使用时扫码登录，登录状态单独保存。",
  },
];

/** 以使用方式为主、术语选项为辅的连接设置。 */
export function AccessModeSettings({
  onChange,
  values,
}: {
  onChange: SettingsChange;
  values: SettingsValues;
}) {
  const intent = detectAccessIntent(values);
  const [showAdvanced, setShowAdvanced] = useState(intent === "custom");

  const chooseIntent = (next: AccessIntent) => {
    const preset = presetForIntent(next);
    if (!preset) return;
    onChange("route_strategy", preset.route_strategy);
    onChange("browser_driver", preset.browser_driver);
  };

  return (
    <SettingsSection
      description="决定这个程序用什么方式打开小红书；保存后立即生效。"
      title="连接方式"
    >
      <div className="grid min-w-0 gap-3 sm:col-span-2 sm:grid-cols-2">
        {INTENTS.map((option) => {
          const active = intent === option.value;
          return (
            <button
              aria-pressed={active}
              className={`min-w-0 rounded-2xl border p-4 text-left transition ${
                active
                  ? "border-red-300 bg-red-50"
                  : "border-stone-200 bg-white hover:border-stone-400"
              }`}
              key={option.value}
              onClick={() => chooseIntent(option.value)}
              type="button"
            >
              <p className="text-sm font-semibold text-stone-900">{option.title}</p>
              <p className="mt-1 text-xs leading-5 text-stone-600">{option.description}</p>
            </button>
          );
        })}
      </div>

      {intent === "custom" && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800 sm:col-span-2">
          当前使用的是自定义组合，可以在下面的高级选项里查看和调整。
        </p>
      )}

      <div className="min-w-0 sm:col-span-2">
        <button
          aria-expanded={showAdvanced}
          className="text-xs font-medium text-stone-600 hover:text-stone-900"
          onClick={() => setShowAdvanced((current) => !current)}
          type="button"
        >
          {showAdvanced ? "收起高级选项" : "展开高级选项"}
        </button>
      </div>

      {showAdvanced && (
        <>
          <SelectSetting
            help="只影响推荐、搜索、详情等读取；点赞、评论和发布不受此项影响。"
            label="读取方式"
            onChange={(value) => onChange("route_strategy", value as RouteStrategy)}
            options={routeOptions}
            value={values.route_strategy}
          />
          <SelectSetting
            help="读取和互动都使用这里选定的浏览器。"
            label="使用哪个浏览器"
            onChange={(value) => onChange("browser_driver", value as BrowserDriver)}
            options={browserOptions}
            value={values.browser_driver}
          />
          <TextSetting
            disabled={values.browser_driver !== "managed"}
            help={
              values.browser_driver === "managed"
                ? "留空即可，程序会自动找到已安装的 Chrome 或 Chromium；只有装在非常规位置时才需要填写。"
                : "当前使用浏览器扩展，不需要这一项。"
            }
            label="自带浏览器位置"
            onChange={(value) => onChange("managed_browser_executable", value || null)}
            placeholder="留空时自动检测本机浏览器"
            value={values.managed_browser_executable ?? ""}
            wide
          />
        </>
      )}
    </SettingsSection>
  );
}
