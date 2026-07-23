import type { DetailResponse } from "../lib/types";

export function makeDetailResponse(
  overrides: Partial<DetailResponse> = {},
): DetailResponse {
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
