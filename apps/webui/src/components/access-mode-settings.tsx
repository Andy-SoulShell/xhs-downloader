import type {
  BrowserDriver,
  RouteStrategy,
  SettingsValues,
} from "../lib/types";
import {
  SelectSetting,
  SettingsSection,
  TextSetting,
} from "./setting-controls";
import type { SettingsChange } from "./settings-sections";

const routeOptions = [
  { label: "仅 Cookie + HTTP", value: "http_only" },
  { label: "仅浏览器", value: "browser_only" },
  { label: "HTTP 优先，失败后使用浏览器", value: "http_first" },
  { label: "浏览器优先，失败后使用 HTTP", value: "browser_first" },
];

const browserOptions = [
  { label: "浏览器扩展", value: "extension" },
  { label: "受管浏览器", value: "managed" },
];

/** 配置只读能力路由顺序及浏览器执行器。 */
export function AccessModeSettings({
  onChange,
  values,
}: {
  onChange: SettingsChange;
  values: SettingsValues;
}) {
  return (
    <SettingsSection
      description="保存后新请求立即采用所选模式；只读任务可安全回退，写操作始终只执行一次。"
      title="访问模式"
    >
      <SelectSetting
        help="HTTP 使用本机保存的 Cookie；回退只会发生在确认尚未产生外部效果的失败上。"
        label="只读路由策略"
        onChange={(value) =>
          onChange("route_strategy", value as RouteStrategy)
        }
        options={routeOptions}
        value={values.route_strategy}
      />
      <SelectSetting
        help="该选择同时用于浏览器读取和写操作；即使只读策略为仅 HTTP，互动与发布仍使用这里选定的执行器。"
        label="浏览器执行器"
        onChange={(value) =>
          onChange("browser_driver", value as BrowserDriver)
        }
        options={browserOptions}
        value={values.browser_driver}
      />
      <TextSetting
        help="可选；请填写 Chrome 或 Chromium 的完整可执行文件路径。清空后恢复自动检测，保存后重启本地服务生效。"
        label="受管 Chromium 可执行文件"
        onChange={(value) =>
          onChange("managed_browser_executable", value || null)
        }
        placeholder="留空时自动检测本机浏览器"
        value={values.managed_browser_executable ?? ""}
        wide
      />
      <p className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs leading-5 text-stone-500 sm:col-span-2">
        浏览器优先级只影响推荐、搜索、详情和主页等读取能力。写操作会固定使用所选浏览器执行器，并在结果无法确认时进入人工核对。
      </p>
    </SettingsSection>
  );
}
