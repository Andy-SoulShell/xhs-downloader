import type { ImageFormat, SettingsValues, VideoPreference } from "../lib/types";
import type { AuthorMappingRow } from "../lib/author-mapping";
import { AuthorMappingEditor } from "./author-mapping-editor";
import { CookieSetupGuide } from "./cookie-setup-guide";
import { NameFormatPicker } from "./name-format-picker";
import {
  NumberSetting,
  SelectSetting,
  SensitiveSetting,
  SettingsSection,
  TextSetting,
  ToggleSetting,
} from "./setting-controls";

export type SettingsChange = <Key extends keyof SettingsValues>(
  key: Key,
  value: SettingsValues[Key],
) => void;

export function StorageSettings({
  mappingRows,
  onChange,
  onMappingChange,
  values,
}: {
  mappingRows: AuthorMappingRow[];
  onChange: SettingsChange;
  onMappingChange: (rows: AuthorMappingRow[]) => void;
  values: SettingsValues;
}) {
  return (
    <SettingsSection description="控制媒体、记录和临时文件的位置及命名方式。" title="目录与记录">
      <TextSetting
        help="留空使用当前目录下的 volume；保存后重启生效。"
        label="数据根目录"
        onChange={(value) => onChange("work_path", value || null)}
        placeholder="例如 /Users/name/Downloads/xhs"
        value={values.work_path ?? ""}
      />
      <TextSetting
        help="只能填写单段目录名，不能包含路径分隔符。"
        label="媒体目录名"
        onChange={(value) => onChange("folder_name", value)}
        value={values.folder_name}
      />
      <NameFormatPicker
        onChange={(value) => onChange("name_format", value)}
        value={values.name_format}
      />
      <ToggleSetting
        checked={values.folder_mode}
        description="为每个作品建立独立目录。"
        label="作品目录"
        onChange={(value) => onChange("folder_mode", value)}
      />
      <ToggleSetting
        checked={values.author_archive}
        description="按作者昵称再分一层目录。"
        label="作者归档"
        onChange={(value) => onChange("author_archive", value)}
      />
      <ToggleSetting
        checked={values.download_record}
        description="使用内容指纹、文件大小和 SHA-256 判断跳过。"
        label="下载记录与校验"
        onChange={(value) => onChange("download_record", value)}
      />
      <ToggleSetting
        checked={values.record_data}
        description="把结构化作品详情保存为 JSON。"
        label="保存作品详情"
        onChange={(value) => onChange("record_data", value)}
      />
      <ToggleSetting
        checked={values.write_mtime}
        description="把文件修改时间设为作品发布时间。"
        label="写入发布时间"
        onChange={(value) => onChange("write_mtime", value)}
      />
      <AuthorMappingEditor onChange={onMappingChange} rows={mappingRows} />
    </SettingsSection>
  );
}

/** 渲染网络请求和本机敏感凭据设置。 */
export function NetworkSettings({
  clearCookie,
  clearProxy,
  cookie,
  cookieConfigured,
  onChange,
  onClearCookieChange,
  onClearProxyChange,
  onCookieChange,
  onProxyChange,
  proxy,
  proxyConfigured,
  values,
}: {
  clearCookie: boolean;
  clearProxy: boolean;
  cookie: string;
  cookieConfigured: boolean;
  onChange: SettingsChange;
  onClearCookieChange: (value: boolean) => void;
  onClearProxyChange: (value: boolean) => void;
  onCookieChange: (value: string) => void;
  onProxyChange: (value: string) => void;
  proxy: string;
  proxyConfigured: boolean;
  values: SettingsValues;
}) {
  return (
    <SettingsSection
      description="保存后会等待当前请求结束并原子替换客户端；敏感原文不会返回浏览器。"
      title="网络与凭据"
    >
      <SensitiveSetting
        clear={clearCookie}
        configured={cookieConfigured}
        help="高级可选项；留空会保留现有值，普通用户优先使用浏览器模式。"
        label="小红书 Cookie"
        onChange={onCookieChange}
        onClearChange={onClearCookieChange}
        placeholder={cookieConfigured ? "输入新值以替换" : "可选"}
        value={cookie}
      />
      <CookieSetupGuide />
      <SensitiveSetting
        clear={clearProxy}
        configured={proxyConfigured}
        help="支持 HTTP 与 SOCKS；凭据不会显示在管理后台。"
        label="代理地址"
        onChange={onProxyChange}
        onClearChange={onClearProxyChange}
        placeholder={proxyConfigured ? "输入新值以替换" : "可选"}
        value={proxy}
      />
      <NumberSetting
        help="单次请求超时秒数，范围 0.1–120。"
        label="请求超时（秒）"
        max={120}
        min={0.1}
        onChange={(value) => onChange("timeout", value)}
        step="any"
        value={values.timeout}
      />
      <NumberSetting
        help="失败后的最大重试次数，范围 0–10。"
        label="最大重试次数"
        max={10}
        min={0}
        onChange={(value) => onChange("max_retry", value)}
        value={values.max_retry}
      />
      <TextSetting
        help="一般无需修改；留空时服务端会恢复内置浏览器标识。"
        label="User-Agent"
        onChange={(value) => onChange("user_agent", value)}
        value={values.user_agent}
        wide
      />
    </SettingsSection>
  );
}

export function DownloadSettings({
  onChange,
  values,
}: {
  onChange: SettingsChange;
  values: SettingsValues;
}) {
  return (
    <SettingsSection description="控制媒体类型、输出格式、流选择与并发资源。" title="下载行为">
      <SelectSetting
        disabled={!values.image_download}
        help={values.image_download ? "自动会保留原始格式。" : "已关闭图片下载，此项暂不生效。"}
        label="图片格式"
        onChange={(value) => onChange("image_format", value as ImageFormat)}
        options={[
          { label: "自动", value: "auto" },
          { label: "JPEG", value: "jpeg" },
          { label: "PNG", value: "png" },
          { label: "WebP", value: "webp" },
          { label: "HEIC", value: "heic" },
          { label: "AVIF", value: "avif" },
        ]}
        value={values.image_format}
      />
      <SelectSetting
        disabled={!values.video_download}
        help={
          values.video_download
            ? "一个作品有多个清晰度时按此挑选。"
            : "已关闭视频下载，此项暂不生效。"
        }
        label="视频流偏好"
        onChange={(value) => onChange("video_preference", value as VideoPreference)}
        options={[
          { label: "分辨率优先", value: "resolution" },
          { label: "码率优先", value: "bitrate" },
          { label: "文件大小优先", value: "size" },
        ]}
        value={values.video_preference}
      />
      <NumberSetting
        help="允许 1–16；同时影响后台任务工作线程。"
        label="最大并发数"
        max={16}
        min={1}
        onChange={(value) => onChange("max_concurrency", value)}
        value={values.max_concurrency}
      />
      <NumberSetting
        help="每次读取的字节数，最低 65536。"
        label="分块大小（字节）"
        min={65536}
        onChange={(value) => onChange("chunk", value)}
        value={values.chunk}
      />
      <ToggleSetting
        checked={values.image_download}
        description="下载普通图片资源。"
        label="下载图片"
        onChange={(value) => onChange("image_download", value)}
      />
      <ToggleSetting
        checked={values.video_download}
        description="下载帖子视频资源。"
        label="下载视频"
        onChange={(value) => onChange("video_download", value)}
      />
      <ToggleSetting
        checked={values.live_download}
        description="下载 Live Photo 附带的动态视频。"
        label="下载动态图片"
        onChange={(value) => onChange("live_download", value)}
      />
    </SettingsSection>
  );
}
