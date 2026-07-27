import type {
  DetailResponse,
  DownloadTask,
  WorkDetail,
} from "./types";
import { UserFacingError } from "./error-message";

export type PostStatus = "ready" | "downloading" | "done" | "error";
export type Filter = "all" | "ready" | "done";
/**
 * 四个工作台。
 *
 * 按用户要做的事划分，而不是按后端子系统划分：内容页承载全部浏览与
 * 下载入口，动态页汇总三类历史，浏览器运维归入设置。
 */
export type WorkspaceView = "content" | "activity" | "publication" | "settings";

/** 内容工作台内部的分段：我的帖子、推荐流与搜索结果。 */
export type ContentTab = "library" | "feeds" | "search";

export interface PostRecord {
  id: string;
  result: DetailResponse;
  selected: Set<number>;
  downloaded: Set<string>;
  force: boolean;
  status: PostStatus;
}

export function postFromDetail(detail: WorkDetail): PostRecord {
  return {
    id: detail.作品ID,
    result: {
      message: "已从帖子库恢复",
      data: detail,
      files: [],
      skipped: false,
    },
    selected: new Set(detail.媒体.map((item) => item.序号)),
    downloaded: new Set(),
    force: false,
    status: "ready",
  };
}

/**
 * 把一次解析结果转换成帖子记录。
 *
 * 默认选中全部媒体，并按已产出文件标记哪些已经下载过。
 *
 * @param result 解析接口返回的详情。
 * @returns 可直接进入帖子库的记录。
 * @throws Error 接口没有返回详情数据。
 */
export function postFromResponse(result: DetailResponse): PostRecord {
  if (!result.data) throw new UserFacingError("没有解析到帖子内容，请确认链接是否正确");
  return {
    id: result.data.作品ID,
    result,
    selected: new Set(result.data.媒体.map((item) => item.序号)),
    downloaded: new Set(
      result.files.map((file) => `${file.media_index}:${file.kind}`),
    ),
    force: false,
    status: "ready",
  };
}

export function mergeTaskResults(
  posts: PostRecord[],
  tasks: DownloadTask[],
): PostRecord[] {
  const latestByWork = new Map<string, DownloadTask>();
  const latestByUrl = new Map<string, DownloadTask>();
  for (const task of tasks) {
    if (!latestByUrl.has(task.source_url)) {
      latestByUrl.set(task.source_url, task);
    }
    if (task.detail && !latestByWork.has(task.detail.作品ID)) {
      latestByWork.set(task.detail.作品ID, task);
    }
  }
  const merged = posts.map((post) => {
    const sourceUrl = post.result.data?.作品链接;
    const task =
      latestByWork.get(post.id) ??
      (sourceUrl ? latestByUrl.get(sourceUrl) : undefined);
    if (!task) return post;
    if (!task.detail) {
      return {
        ...post,
        result: { ...post.result, message: task.message },
        status: taskStatus(task),
      };
    }
    return postFromTask(task, post);
  });
  const known = new Set(merged.map((post) => post.id));
  for (const task of latestByWork.values()) {
    if (task.detail && !known.has(task.detail.作品ID)) {
      merged.push(postFromTask(task));
    }
  }
  return merged;
}

function postFromTask(
  task: DownloadTask,
  existing?: PostRecord,
): PostRecord {
  const detail = task.detail!;
  const selected =
    existing?.selected ??
    (task.media_indexes.length
      ? new Set(task.media_indexes)
      : new Set(detail.媒体.map((item) => item.序号)));
  return {
    id: detail.作品ID,
    result: {
      message: task.message,
      data: detail,
      files: task.artifacts,
      skipped: false,
    },
    selected,
    downloaded: new Set([
      ...(existing?.downloaded ?? []),
      ...task.artifacts.map((file) => `${file.media_index}:${file.kind}`),
    ]),
    force: existing?.force ?? task.force,
    status: taskStatus(task),
  };
}

function taskStatus(task: DownloadTask): PostStatus {
  if (task.status === "completed") return "done";
  if (task.status === "failed") return "error";
  return "downloading";
}
