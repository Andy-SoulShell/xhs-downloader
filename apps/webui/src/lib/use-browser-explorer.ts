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
  LoginQrCodeResult,
} from "./types";
import {
  deleteCookies,
  executeBrowserOperation,
  executeReadCapability,
  type CapabilityRoute,
} from "./browser-api";

/** 浏览器探索页面的读取状态和互动操作。 */
export interface BrowserExplorer {
  account: BrowserLoginState | null;
  busy: boolean;
  detail: FeedDetailResult | null;
  error: string;
  feeds: FeedSummary[];
  route: CapabilityRoute | null;
  qrCode: LoginQrCodeResult | null;
  sessionMessage: string;
  task: BrowserTask | null;
  checkLogin: () => Promise<void>;
  deleteBrowserCookies: () => Promise<void>;
  getLoginQrCode: () => Promise<void>;
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
  const [route, setRoute] = useState<CapabilityRoute | null>(null);
  const [qrCode, setQrCode] = useState<LoginQrCodeResult | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [task, setTask] = useState<BrowserTask | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  // 浏览器能力请求可能长轮询，卸载或新操作时取消旧请求以防陈旧结果覆盖当前页面。
  useEffect(() => () => activeRequest.current?.abort(), []);

  const runRequest = useCallback(
    async <T,>(
      request: (signal: AbortSignal) => Promise<T>,
      apply: (result: T) => void,
    ) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setBusy(true);
      setError("");
      setSessionMessage("");
      try {
        const result = await request(controller.signal);
        if (activeRequest.current !== controller) return;
        apply(result);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "能力请求执行失败");
      } finally {
        if (activeRequest.current === controller) {
          activeRequest.current = null;
          setBusy(false);
        }
      }
    },
    [],
  );

  const runBrowser = useCallback(
    <T,>(
      path: string,
      payload: Record<string, JsonValue>,
      apply: (data: T) => void,
    ) =>
      runRequest(
        (signal) => executeBrowserOperation<T>(path, payload, signal),
        (result) => {
          setTask(result.task);
          apply(result.data);
        },
      ),
    [runRequest],
  );
  const runRead = useCallback(
    <T,>(
      path: string,
      payload: Record<string, JsonValue>,
      apply: (data: T) => void,
    ) =>
      runRequest(
        (signal) => executeReadCapability<T>(path, payload, signal),
        (result) => {
          setTask(null);
          setRoute(result.route);
          apply(result.data);
        },
      ),
    [runRequest],
  );
  const checkLogin = useCallback(
    () =>
      runBrowser<BrowserLoginState>("/xhs/login/status", {}, (data) => {
        setAccount(data);
        if (data.logged_in) setQrCode(null);
      }),
    [runBrowser],
  );
  const getLoginQrCode = useCallback(
    () =>
      runBrowser<LoginQrCodeResult>("/xhs/login/qrcode", {}, (data) => {
        setQrCode(data);
        setAccount({
          logged_in: data.is_logged_in,
          user_id: null,
          nickname: null,
        });
      }),
    [runBrowser],
  );
  const deleteBrowserCookies = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError("");
    setSessionMessage("");
    try {
      const result = await deleteCookies("browser", controller.signal);
      if (activeRequest.current !== controller) return;
      setAccount({ logged_in: false, user_id: null, nickname: null });
      setQrCode(null);
      setSessionMessage(result.message);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(
        reason instanceof Error ? reason.message : "浏览器 Cookie 清理失败",
      );
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }, []);
  const loadFeeds = useCallback(
    () =>
      runRead<FeedListResult>("/xhs/feeds/list", {}, (data) => {
        setDetail(null);
        setFeeds(data.items);
      }),
    [runRead],
  );
  const search = useCallback(
    (keyword: string) =>
      runRead<FeedListResult>(
        "/xhs/feeds/search",
        { keyword, filters: {} },
        (data) => {
          setDetail(null);
          setFeeds(data.items);
        },
      ),
    [runRead],
  );
  const openFeed = useCallback(
    (feed: FeedSummary) =>
      runRead<FeedDetailResult>(
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
    [runRead],
  );
  const setInteraction = useCallback(
    (kind: "like" | "favorite", active: boolean) => {
      if (!detail) return Promise.resolve();
      return runBrowser<DesiredStateResult>(
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
    [detail, runBrowser],
  );
  const postCurrentComment = useCallback(
    (content: string) => {
      if (!detail) return Promise.resolve();
      return runBrowser<CommentResult>(
        "/xhs/feeds/comment",
        {
          feed_id: detail.feed_id,
          xsec_token: detail.xsec_token,
          content,
        },
        () => undefined,
      );
    },
    [detail, runBrowser],
  );
  const replyCurrentComment = useCallback(
    (commentId: string, content: string) => {
      if (!detail) return Promise.resolve();
      return runBrowser<CommentResult>(
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
    [detail, runBrowser],
  );

  return {
    account,
    busy,
    detail,
    error,
    feeds,
    route,
    qrCode,
    sessionMessage,
    task,
    checkLogin,
    deleteBrowserCookies,
    getLoginQrCode,
    loadFeeds,
    openFeed,
    postComment: postCurrentComment,
    replyComment: replyCurrentComment,
    search,
    setInteraction,
  };
}
