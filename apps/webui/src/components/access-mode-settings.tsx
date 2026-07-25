import type {
  BrowserDriver,
  RouteStrategy,
  SettingsValues,
} from "../lib/types";
import { SelectSetting, SettingsSection } from "./setting-controls";
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
  const browserDisabled = values.route_strategy === "http_only";
  return (
    <SettingsSection
      description="只读任务可按顺序安全回退；点赞、收藏和发布始终只执行一次，不会跨模式重试。"
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
        disabled={browserDisabled}
        help={
          browserDisabled
            ? "当前仅使用 HTTP；切换到含浏览器的策略后可选择执行器。"
            : "扩展复用日常浏览器登录态；受管浏览器使用独立且持久化的用户目录。"
        }
        label="浏览器执行器"
        onChange={(value) =>
          onChange("browser_driver", value as BrowserDriver)
        }
        options={browserOptions}
        value={values.browser_driver}
      />
      <p className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs leading-5 text-stone-500 sm:col-span-2">
        浏览器优先级只影响推荐、搜索、详情和主页等读取能力。写操作会固定使用所选浏览器执行器，并在结果无法确认时进入人工核对。
      </p>
    </SettingsSection>
  );
}
