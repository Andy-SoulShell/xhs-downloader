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
import { useBrowserSession } from "./browser-session";

/**
 * 浏览器探索页面的读取状态和互动操作。
 *
 * 所有请求型方法都回报本次是否真的成功应用了结果；调用方据此决定要不要
 * 清空用户已经输入的内容。
 */
interface BrowserExplorer {
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
  checkLogin: () => Promise<boolean>;
  closeDetail: () => void;
  deleteBrowserCookies: () => Promise<boolean>;
  getLoginQrCode: () => Promise<boolean>;
  loadFeeds: () => Promise<boolean>;
  loadMore: () => Promise<void>;
  openFeed: (feed: FeedSummary) => Promise<boolean>;
  postComment: (content: string) => Promise<boolean>;
  replyComment: (commentId: string, content: string) => Promise<boolean>;
  search: (keyword: string) => Promise<boolean>;
  setInteraction: (kind: "like" | "favorite", active: boolean) => Promise<boolean>;
}

/** 管理浏览器任务、竞态取消和类型化结果。 */
export function useBrowserExplorer(): BrowserExplorer {
  // 登录结果要显示在设置页的连接状态卡上，所以放在全应用共享的会话里。
  const { account, setAccount } = useBrowserSession();
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

  /**
   * 执行一次浏览器能力请求。
   *
   * @returns 是否真的成功应用了结果；失败时调用方据此保留用户已输入的内容，
   *   此前一律当成功处理，评论失败也会把输入框清空。
   */
  const runRequest = useCallback(
    async <T>(
      request: (signal: AbortSignal) => Promise<T>,
      apply: (result: T) => void,
    ): Promise<boolean> => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setBusy(true);
      setError("");
      setSessionMessage("");
      try {
        const result = await request(controller.signal);
        if (activeRequest.current !== controller) return false;
        apply(result);
        return true;
      } catch (reason) {
        if (controller.signal.aborted) return false;
        setError(reason instanceof Error ? reason.message : "能力请求执行失败");
        return false;
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
    [runBrowser, setAccount],
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
    [runBrowser, setAccount],
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
    [runRequest, setAccount],
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
      if (!request) return Promise.resolve(false);
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
        : Promise.resolve(false);
    },
    [detail, runBrowser],
  );
  const replyComment = useCallback(
    (commentId: string, content: string) => {
      const request = replyRequest(detail, commentId, content);
      return request
        ? runBrowser(request.path, request.payload, () => undefined)
        : Promise.resolve(false);
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
