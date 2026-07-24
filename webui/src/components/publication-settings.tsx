import type { SettingsValues } from "../lib/types";
import {
  NumberSetting,
  SettingsSection,
} from "./setting-controls";
import type { SettingsChange } from "./settings-sections";

export function PublicationSettings({
  onChange,
  values,
}: {
  onChange: SettingsChange;
  values: SettingsValues;
}) {
  return (
    <SettingsSection
      description="限制待发布素材占用，并控制浏览器扩展中断后的安全恢复时间。"
      title="内容发布"
    >
      <NumberSetting
        help="单个素材最大字节数，范围 1 MiB–10 GiB；保存后重启生效。"
        label="单个发布素材上限（字节）"
        max={10 * 1024 * 1024 * 1024}
        min={1024 * 1024}
        onChange={(value) => onChange("publish_max_asset_size", value)}
        value={values.publish_max_asset_size}
      />
      <NumberSetting
        help="扩展无状态回传后重新排队或转为待确认的时间，范围 60–1800 秒。"
        label="发布任务租约（秒）"
        max={1800}
        min={60}
        onChange={(value) => onChange("publish_lease_seconds", value)}
        value={values.publish_lease_seconds}
      />
    </SettingsSection>
  );
}
