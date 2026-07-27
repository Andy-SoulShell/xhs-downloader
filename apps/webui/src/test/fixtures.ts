import type { DetailResponse, DownloadTask, SettingsResponse } from "../lib/types";
import type { PublicationDraft, PublicationTask } from "../lib/publication";

export function makeDetailResponse(overrides: Partial<DetailResponse> = {}): DetailResponse {
  return {
    message: "作品信息解析完成",
    data: {
      作品ID: "synthetic-work",
      作品链接: "https://example.invalid/work",
      作品标题: "合成测试帖子",
      作品描述: "这是一段完全合成的帖子描述。",
      作品类型: "图文",
      作品标签: ["合成", "测试"],
      发布时间: "2024-01-02T03:04:05Z",
      最后更新时间: null,
      点赞数量: "10",
      收藏数量: "2",
      评论数量: "1",
      分享数量: "0",
      作者: {
        作者ID: "synthetic-author",
        作者昵称: "合成作者",
        作者链接: "https://example.invalid/author",
        头像地址: "https://example.invalid/avatar.jpeg",
      },
      媒体: [
        {
          序号: 1,
          类型: "图片",
          地址: "https://example.invalid/image-1",
          扩展名: "jpeg",
        },
        {
          序号: 1,
          类型: "动态图片",
          地址: "https://example.invalid/live-1",
          扩展名: "mp4",
        },
        {
          序号: 2,
          类型: "图片",
          地址: "https://example.invalid/image-2",
          扩展名: "jpeg",
        },
      ],
    },
    files: [],
    skipped: false,
    ...overrides,
  };
}

export function makeDownloadTask(overrides: Partial<DownloadTask> = {}): DownloadTask {
  const detail = makeDetailResponse().data;
  return {
    task_id: "synthetic-task",
    client_request_id: "synthetic-request",
    source_url: "https://example.invalid/work",
    media_indexes: [1, 2],
    force: false,
    status: "completed",
    attempts: 1,
    message: "作品文件下载完成",
    progress: {
      completed_files: 0,
      total_files: 0,
      received_bytes: 0,
      total_bytes: 0,
    },
    detail,
    artifacts: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:01Z",
    ...overrides,
  };
}

export function makeSettingsResponse(overrides: Partial<SettingsResponse> = {}): SettingsResponse {
  return {
    values: {
      work_path: null,
      folder_name: "download",
      name_format: "发布时间 作者昵称 作品标题",
      user_agent: "synthetic-agent",
      timeout: 15,
      chunk: 2097152,
      max_retry: 3,
      max_concurrency: 4,
      record_data: false,
      image_format: "jpeg",
      image_download: true,
      video_download: true,
      live_download: false,
      video_preference: "resolution",
      folder_mode: false,
      download_record: true,
      author_archive: false,
      write_mtime: false,
      mapping_data: {},
      server_host: "127.0.0.1",
      server_port: 5556,
      log_level: "info",
      publish_max_asset_size: 1073741824,
      publish_lease_seconds: 300,
      browser_task_lease_seconds: 120,
      route_strategy: "browser_only",
      browser_driver: "extension",
      managed_browser_executable: null,
      managed_browser_headless: false,
      managed_browser_offscreen: false,
      managed_browser_startup_timeout: 15,
      managed_browser_shutdown_timeout: 5,
    },
    config_file: "/tmp/synthetic.env",
    restart_required: false,
    overridden_fields: [],
    cookie_configured: false,
    proxy_configured: false,
    ...overrides,
  };
}

export function makePublicationDraft(overrides: Partial<PublicationDraft> = {}): PublicationDraft {
  return {
    draft_id: "synthetic-draft",
    title: "合成发布标题",
    body: "合成发布正文",
    tags: ["合成", "测试"],
    visibility: "public",
    is_original: false,
    products: [],
    assets: [
      {
        asset_id: "synthetic-asset",
        filename: "synthetic.jpeg",
        media_type: "image/jpeg",
        size: 1024,
        sha256: "a".repeat(64),
        position: 0,
      },
    ],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:01Z",
    content_fingerprint: "c".repeat(64),
    ...overrides,
  };
}

export function makePublicationTask(overrides: Partial<PublicationTask> = {}): PublicationTask {
  const draft = makePublicationDraft();
  return {
    task_id: "synthetic-publication-task",
    package: draft,
    // 与草稿当前内容一致：默认情况下不应被判定为"提交后又改过"。
    package_fingerprint: draft.content_fingerprint ?? "",
    mode: "manual",
    target_driver: "extension",
    status: "ready",
    scheduled_at: "2026-01-02T00:00:00Z",
    executor_id: null,
    extension_id: null,
    lease_expires_at: null,
    attempts: 0,
    message: "等待扩展立即发布",
    result_url: null,
    publish_attempted: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:01Z",
    ...overrides,
  };
}
