import type {
  DetailResponse,
  DownloadTask,
} from "./types";

export type PostStatus = "ready" | "downloading" | "done" | "error";
export type Filter = "all" | "ready" | "done";
export type WorkspaceView = "posts" | "tasks" | "records" | "settings";

export interface PostRecord {
  id: string;
  result: DetailResponse;
  selected: Set<number>;
  downloaded: Set<string>;
  force: boolean;
  status: PostStatus;
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
