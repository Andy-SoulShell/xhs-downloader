import { useCallback, useEffect, useRef, useState } from "react";
import type { JsonValue } from "@xhs-downloader/contracts";

import type {
  BrowserLoginState,
  BrowserTask,
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
import {
  commentRequest,
  desiredStateRequest,
  metricKeyOf,
  replyRequest,
} from "./feed-interactions";
import {
  appendUniqueFeeds,
  feedContextFrom,
  loadNextFeedPage,
  type FeedContext,
} from "./feed-pagination";
import { useQrLoginWatch } from "./use-qr-login-watch";

/** 浏览器探索页面的读取状态和互动操作。 */
export interface BrowserExplorer {
  account: BrowserLoginState | null;
  busy: boolean;
  context: FeedContext | null;
  detail: FeedDetailResult | null;
  error: string;
  feeds: FeedSummary[];
  loadingMore: boolean;
  route: CapabilityRoute | null;
  qrCode: LoginQrCodeResult | null;
  sessionMessage: string;
  task: BrowserTask | null;
  checkLogin: () => Promise<void>;
  closeDetail: () => void;
  deleteBrowserCookies: () => Promise<void>;
  getLoginQrCode: () => Promise<void>;
  loadFeeds: () => Promise<void>;
  loadMore: () => Promise<void>;
  openFeed: (feed: FeedSummary) => Promise<void>;
  postComment: (content: string) => Promise<void>;
  replyComment: (commentId: string, content: string) => Promise<void>;
  search: (keyword: string) => Promise<void>;
  setInteraction: (kind: "like" | "favorite", active: boolean) => Promise<void>;
}

/** 管理浏览器任务、竞态取消和类型化结果。 */
export function useBrowserExplorer(): BrowserExplorer {
  const [account, setAccount] = useState<BrowserLoginState | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<FeedDetailResult | null>(null);
  const [error, setError] = useState("");
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
  const [context, setContext] = useState<FeedContext | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [route, setRoute] = useState<CapabilityRoute | null>(null);
  const [qrCode, setQrCode] = useState<LoginQrCodeResult | null>(null);
  const [sessionMessage, setSessionMessage] = useState("");
  const [task, setTask] = useState<BrowserTask | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  // 浏览器能力请求可能长轮询，卸载或新操作时取消旧请求以防陈旧结果覆盖当前页面。
  useEffect(() => () => activeRequest.current?.abort(), []);

  const runRequest = useCallback(
    async <T>(request: (signal: AbortSignal) => Promise<T>, apply: (result: T) => void) => {
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
    <T>(path: string, payload: Record<string, JsonValue>, apply: (data: T) => void) =>
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
    <T>(path: string, payload: Record<string, JsonValue>, apply: (data: T) => void) =>
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
  // 二维码亮着的时候自动盯登录状态：扫码在手机上完成，这边没有事件可听，
  // 不能要求用户扫完再回来手点一次「检查登录」。
  useQrLoginWatch(
    qrCode,
    useCallback((state: BrowserLoginState) => {
      setAccount(state);
      setQrCode(null);
      setSessionMessage("扫码登录成功");
    }, []),
  );
  const deleteBrowserCookies = useCallback(
    () =>
      runRequest(
        (signal) => deleteCookies("browser", signal),
        (result) => {
          setAccount({ logged_in: false, user_id: null, nickname: null });
          setQrCode(null);
          setSessionMessage(result.message);
        },
      ),
    [runRequest],
  );
  const loadFeeds = useCallback(
    () =>
      runRead<FeedListResult>("/xhs/feeds/list", {}, (data) => {
        setDetail(null);
        setFeeds(data.items);
        setContext(feedContextFrom("home", "", data));
      }),
    [runRead],
  );
  const search = useCallback(
    (keyword: string) =>
      runRead<FeedListResult>("/xhs/feeds/search", { keyword, filters: {} }, (data) => {
        setDetail(null);
        setFeeds(data.items);
        setContext(feedContextFrom("search", keyword, data));
      }),
    [runRead],
  );

  /**
   * 追加下一页结果。
   *
   * 与首次读取共用同一个来源和关键词，并单独维护加载状态，
   * 避免整页进入忙碌态而遮住已经看到的结果。
   */
  const loadMore = useCallback(async () => {
    if (!context?.hasMore || loadingMore) return;
    const controller = new AbortController();
    setLoadingMore(true);
    try {
      const page = await loadNextFeedPage(context, controller.signal);
      setRoute(page.route);
      setFeeds((current) => appendUniqueFeeds(current, page.items));
      setContext(page.context);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载更多失败");
    } finally {
      setLoadingMore(false);
    }
  }, [context, loadingMore]);

  /** 关闭详情但保留当前浏览结果，避免用户回到列表时丢失搜索上下文。 */
  const closeDetail = useCallback(() => setDetail(null), []);
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
      const request = desiredStateRequest(detail, kind, active);
      if (!request) return Promise.resolve();
      return runBrowser(request.path, request.payload, () =>
        setDetail((current) =>
          current
            ? {
                ...current,
                metrics: {
                  ...current.metrics,
                  [metricKeyOf(kind)]: active,
                },
              }
            : current,
        ),
      );
    },
    [detail, runBrowser],
  );
  const postComment = useCallback(
    (content: string) => {
      const request = commentRequest(detail, content);
      return request
        ? runBrowser(request.path, request.payload, () => undefined)
        : Promise.resolve();
    },
    [detail, runBrowser],
  );
  const replyComment = useCallback(
    (commentId: string, content: string) => {
      const request = replyRequest(detail, commentId, content);
      return request
        ? runBrowser(request.path, request.payload, () => undefined)
        : Promise.resolve();
    },
    [detail, runBrowser],
  );

  return {
    account,
    busy,
    context,
    detail,
    error,
    feeds,
    loadingMore,
    route,
    qrCode,
    sessionMessage,
    task,
    checkLogin,
    closeDetail,
    deleteBrowserCookies,
    getLoginQrCode,
    loadFeeds,
    loadMore,
    openFeed,
    postComment,
    replyComment,
    search,
    setInteraction,
  };
}
