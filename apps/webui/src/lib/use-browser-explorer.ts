import { useCallback, useEffect, useRef, useState } from "react";
import type { JsonValue } from "@xhs-downloader/contracts";

import type {
  BrowserLoginState,
  BrowserTask,
  CommentResult,
  DesiredStateResult,
  FeedDetailResult,
  FeedListResult,
  FeedSummary,
} from "./types";
import { executeBrowserOperation } from "./browser-api";

/** 浏览器探索页面的读取状态和互动操作。 */
export interface BrowserExplorer {
  account: BrowserLoginState | null;
  busy: boolean;
  detail: FeedDetailResult | null;
  error: string;
  feeds: FeedSummary[];
  task: BrowserTask | null;
  checkLogin: () => Promise<void>;
  loadFeeds: () => Promise<void>;
  openFeed: (feed: FeedSummary) => Promise<void>;
  postComment: (content: string) => Promise<void>;
  replyComment: (commentId: string, content: string) => Promise<void>;
  search: (keyword: string) => Promise<void>;
  setInteraction: (
    kind: "like" | "favorite",
    active: boolean,
  ) => Promise<void>;
}

/** 管理浏览器任务、竞态取消和类型化结果。 */
export function useBrowserExplorer(): BrowserExplorer {
  const [account, setAccount] = useState<BrowserLoginState | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<FeedDetailResult | null>(null);
  const [error, setError] = useState("");
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
  const [task, setTask] = useState<BrowserTask | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  // 浏览器能力请求可能长轮询，卸载或新操作时取消旧请求以防陈旧结果覆盖当前页面。
  useEffect(() => () => activeRequest.current?.abort(), []);

  const run = useCallback(
    async <T,>(
      path: string,
      payload: Record<string, JsonValue>,
      apply: (data: T) => void,
    ) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setBusy(true);
      setError("");
      try {
        const result = await executeBrowserOperation<T>(
          path,
          payload,
          controller.signal,
        );
        if (activeRequest.current !== controller) return;
        setTask(result.task);
        apply(result.data);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "浏览器任务执行失败");
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setBusy(false);
        }
      }
    },
    [],
  );

  const checkLogin = useCallback(
    () =>
      run<BrowserLoginState>("/xhs/login/status", {}, (data) =>
        setAccount(data),
      ),
    [run],
  );
  const loadFeeds = useCallback(
    () =>
      run<FeedListResult>("/xhs/feeds/list", {}, (data) => {
        setDetail(null);
        setFeeds(data.items);
      }),
    [run],
  );
  const search = useCallback(
    (keyword: string) =>
      run<FeedListResult>(
        "/xhs/feeds/search",
        { keyword, filters: {} },
        (data) => {
          setDetail(null);
          setFeeds(data.items);
        },
      ),
    [run],
  );
  const openFeed = useCallback(
    (feed: FeedSummary) =>
      run<FeedDetailResult>(
        "/xhs/feeds/detail",
        {
          feed_id: feed.feed_id,
          xsec_token: feed.xsec_token,
          comment_limit: 10,
          include_replies: true,
          reply_limit: 5,
        },
        setDetail,
      ),
    [run],
  );
  const setInteraction = useCallback(
    (kind: "like" | "favorite", active: boolean) => {
      if (!detail) return Promise.resolve();
      return run<DesiredStateResult>(
        kind === "like" ? "/xhs/feeds/like" : "/xhs/feeds/favorite",
        {
          feed_id: detail.feed_id,
          xsec_token: detail.xsec_token,
          active,
        },
        () =>
          setDetail((current) =>
            current
              ? {
                  ...current,
                  metrics: {
                    ...current.metrics,
                    [kind === "like" ? "liked" : "collected"]: active,
                  },
                }
              : current,
          ),
      );
    },
    [detail, run],
  );
  const postCurrentComment = useCallback(
    (content: string) => {
      if (!detail) return Promise.resolve();
      return run<CommentResult>(
        "/xhs/feeds/comment",
        {
          feed_id: detail.feed_id,
          xsec_token: detail.xsec_token,
          content,
        },
        () => undefined,
      );
    },
    [detail, run],
  );
  const replyCurrentComment = useCallback(
    (commentId: string, content: string) => {
      if (!detail) return Promise.resolve();
      return run<CommentResult>(
        "/xhs/feeds/comment/reply",
        {
          feed_id: detail.feed_id,
          xsec_token: detail.xsec_token,
          content,
          comment_id: commentId,
          user_id: null,
        },
        () => undefined,
      );
    },
    [detail, run],
  );

  return {
    account,
    busy,
    detail,
    error,
    feeds,
    task,
    checkLogin,
    loadFeeds,
    openFeed,
    postComment: postCurrentComment,
    replyComment: replyCurrentComment,
    search,
    setInteraction,
  };
}
