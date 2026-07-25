import type { BrowserDriver as BrowserDriverValue } from "@xhs-downloader/contracts";

/** 浏览器客户端与本机服务共享的稳定数据类型。 */
export type {
  BrowserDriver,
  BrowserLoginState,
  BrowserTask,
  BrowserTaskStatus,
  ClientDownloadRecord,
  CommentResult,
  DesiredStateResult,
  FeedDetailResult,
  FeedListResult,
  FeedSummary,
  LoginQrCodeResult,
  UserProfileResult,
} from "@xhs-downloader/contracts";

export type MediaKind = "视频" | "图片" | "动态图片";

export interface MediaResource {
  序号: number;
  类型: MediaKind;
  地址: string;
  扩展名: string;
  预览地址?: string | null;
}

export interface WorkDetail {
  作品ID: string;
  作品链接: string;
  作品标题: string;
  作品描述: string;
  作品类型: string;
  作品标签: string[];
  发布时间: string | null;
  最后更新时间: string | null;
  点赞数量: string;
  收藏数量: string;
  评论数量: string;
  分享数量: string;
  作者: {
    作者ID: string;
    作者昵称: string;
    作者链接: string;
    头像地址?: string | null;
  };
  媒体: MediaResource[];
}

export interface DownloadArtifact {
  path: string;
  sha256: string;
  size: number;
  media_index: number;
  kind: MediaKind;
}

export interface DetailResponse {
  message: string;
  data: WorkDetail | null;
  files: DownloadArtifact[];
  skipped: boolean;
}

export interface DetailRequest {
  url: string;
  download: boolean;
  index?: number[];
  force?: boolean;
}

export type DownloadTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface DownloadTask {
  task_id: string;
  client_request_id: string | null;
  source_url: string;
  media_indexes: number[];
  force: boolean;
  status: DownloadTaskStatus;
  attempts: number;
  message: string;
  detail: WorkDetail | null;
  artifacts: DownloadArtifact[];
  created_at: string;
  updated_at: string;
}

export interface TaskRequest {
  url: string;
  index: number[];
  force: boolean;
  request_id: string;
}

export type ImageFormat =
  | "auto"
  | "png"
  | "webp"
  | "jpeg"
  | "heic"
  | "avif";
export type VideoPreference = "resolution" | "bitrate" | "size";

/** 只读能力的 HTTP 与浏览器调用顺序。 */
export type RouteStrategy =
  | "http_only"
  | "browser_only"
  | "http_first"
  | "browser_first";

/** 判断不可信配置值是否为当前 WebUI 支持的浏览器执行器。 */
export function isBrowserDriver(value: unknown): value is BrowserDriverValue {
  return value === "extension" || value === "managed";
}

/** 管理后台可以读取和编辑的非敏感配置。 */
export interface SettingsValues {
  work_path: string | null;
  folder_name: string;
  name_format: string;
  user_agent: string;
  timeout: number;
  chunk: number;
  max_retry: number;
  max_concurrency: number;
  record_data: boolean;
  image_format: ImageFormat;
  image_download: boolean;
  video_download: boolean;
  live_download: boolean;
  video_preference: VideoPreference;
  folder_mode: boolean;
  download_record: boolean;
  author_archive: boolean;
  write_mtime: boolean;
  mapping_data: Record<string, string>;
  server_host: string;
  server_port: number;
  log_level: string;
  publish_max_asset_size: number;
  publish_lease_seconds: number;
  browser_task_lease_seconds: number;
  route_strategy: RouteStrategy;
  browser_driver: BrowserDriverValue;
  /** 受管 Chromium 可执行文件完整路径；为空时由服务自动检测。 */
  managed_browser_executable: string | null;
  managed_browser_headless: boolean;
  managed_browser_startup_timeout: number;
  managed_browser_shutdown_timeout: number;
}

export interface SettingsResponse {
  values: SettingsValues;
  config_file: string;
  restart_required: boolean;
  overridden_fields: string[];
  cookie_configured: boolean;
  proxy_configured: boolean;
}

/** 保存配置时可附加只写不回显的敏感字段。 */
export type SettingsUpdate = SettingsValues & {
  cookie?: string | null;
  proxy?: string | null;
};
