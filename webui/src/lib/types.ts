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

export interface ClientDownloadRecord {
  record_id: string;
  work_id: string;
  source_url: string;
  title: string;
  mode: "browser" | "background";
  status: "completed" | "failed";
  media_indexes: number[];
  created_at: string;
  message: string;
}

export type ImageFormat =
  | "auto"
  | "png"
  | "webp"
  | "jpeg"
  | "heic"
  | "avif";
export type VideoPreference = "resolution" | "bitrate" | "size";

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
}

export interface SettingsResponse {
  values: SettingsValues;
  config_file: string;
  restart_required: boolean;
  overridden_fields: string[];
  cookie_configured: boolean;
  proxy_configured: boolean;
}

export type SettingsUpdate = SettingsValues & {
  cookie?: string | null;
  proxy?: string | null;
};
