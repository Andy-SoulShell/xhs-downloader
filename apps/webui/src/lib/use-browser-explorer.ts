import { useCallback, useEffect, useRef, useState } from "react";
import type { JsonValue } from "@xhs-downloader/contracts";

import type {
  BrowserLoginState,
  BrowserTask,
  FeedDetailResult,
  FeedListResult,
  FeedSummary,
} from "./types";
import { executeBrowserOperation } from "./browser-api";

/** 浏览器探索页面的只读状态和操作。 */
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
  search: (keyword: string) => Promise<void>;
}

/** 管理浏览器只读任务、竞态取消和类型化结果。 */
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
    search,
  };
}
