import type { SettingsValues } from "../lib/types";
import { NumberSetting, SelectSetting, SettingsSection, TextSetting } from "./setting-controls";
import type { SettingsChange } from "./settings-sections";

export function ServiceSettings({
  onChange,
  values,
}: {
  onChange: SettingsChange;
  values: SettingsValues;
}) {
  return (
    <SettingsSection description="修改监听地址、端口或日志级别后必须重启服务。" title="本地服务">
      <TextSetting
        help="仅本机使用建议填写 127.0.0.1。"
        label="监听地址"
        onChange={(value) => onChange("server_host", value)}
        value={values.server_host}
      />
      <NumberSetting
        help="API 与 MCP 共用；范围 1–65535。"
        label="监听端口"
        max={65535}
        min={1}
        onChange={(value) => onChange("server_port", value)}
        value={values.server_port}
      />
      <SelectSetting
        help="应用、Uvicorn 与 MCP 共用 Loguru 日志级别。"
        label="日志级别"
        onChange={(value) => onChange("log_level", value)}
        options={[
          { label: "Trace", value: "trace" },
          { label: "Debug", value: "debug" },
          { label: "Info", value: "info" },
          { label: "Warning", value: "warning" },
          { label: "Error", value: "error" },
          { label: "Critical", value: "critical" },
        ]}
        value={values.log_level}
      />
    </SettingsSection>
  );
}
