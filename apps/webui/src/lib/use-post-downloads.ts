import { useCallback } from "react";

import { submitDetail } from "./api";
import type { TaskRequest, DownloadTask } from "./types";
import { postFromResponse, type PostRecord } from "./workspace";

interface PostDownloadsOptions {
  createTask: (request: TaskRequest) => Promise<DownloadTask>;
  notify: (message: string) => void;
  setOnline: (online: boolean) => void;
  setPosts: (update: (current: PostRecord[]) => PostRecord[]) => void;
  updatePost: (id: string, change: Partial<PostRecord>) => void;
}

/** 帖子下载相关操作。 */
export interface PostDownloads {
  /** 下载帖子库中一条已解析的帖子。 */
  downloadPost: (post: PostRecord) => Promise<void>;
  /** 下载一条浏览结果：先解析入库，再排入下载。 */
  downloadFeed: (url: string, title: string) => Promise<void>;
}

/**
 * 提供从帖子库和浏览结果两条入口发起的下载。
 *
 * 两条入口共用同一套解析、入库与排队流程，因此浏览时看到的帖子可以
 * 直接下载，不必先复制链接再回到帖子库粘贴。
 */
export function usePostDownloads({
  createTask,
  notify,
  setOnline,
  setPosts,
  updatePost,
}: PostDownloadsOptions): PostDownloads {
  const downloadPost = useCallback(
    async (post: PostRecord) => {
      const detail = post.result.data;
      if (!detail) return;
      if (!post.selected.size) {
        notify("请至少选择一张图片或视频");
        return;
      }
      updatePost(post.id, { status: "downloading" });
      try {
        await createTask({
          url: detail.作品链接,
          index: [...post.selected].sort((a, b) => a - b),
          force: post.force,
          request_id: crypto.randomUUID(),
        });
        setOnline(true);
        notify("已开始下载，可以在动态里查看进度");
      } catch (error) {
        updatePost(post.id, { status: "error" });
        setOnline(false);
        notify(error instanceof Error ? error.message : "下载失败");
      }
    },
    [createTask, notify, setOnline, updatePost],
  );

  const downloadFeed = useCallback(
    async (url: string, title: string) => {
      try {
        const result = await submitDetail({ url, download: false });
        const post = postFromResponse(result);
        setPosts((current) => [
          post,
          ...current.filter((item) => item.id !== post.id),
        ]);
        await createTask({
          url,
          index: [...post.selected].sort((a, b) => a - b),
          force: false,
          request_id: crypto.randomUUID(),
        });
        setOnline(true);
        notify(`已开始下载「${title}」`);
      } catch (error) {
        setOnline(false);
        notify(error instanceof Error ? error.message : "下载失败");
      }
    },
    [createTask, notify, setOnline, setPosts],
  );

  return { downloadPost, downloadFeed };
}
