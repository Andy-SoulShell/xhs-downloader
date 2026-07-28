import type { JsonValue } from "@xhs-downloader/contracts";

import type { FeedDetailResult } from "./types";

/** 一次互动请求的目标接口与冻结输入。 */
interface FeedInteractionRequest {
  path: string;
  payload: Record<string, JsonValue>;
}

/** 当前详情的访问上下文；没有打开详情时为空。 */
function targetOf(detail: FeedDetailResult | null): Record<string, JsonValue> | null {
  return detail ? { feed_id: detail.feed_id, xsec_token: detail.xsec_token } : null;
}

/**
 * 构造点赞或收藏请求。
 *
 * @param detail 当前打开的帖子详情。
 * @param kind 点赞或收藏。
 * @param active 目标状态；服务端会核验实际结果。
 * @returns 请求描述；没有打开详情时为空。
 */
export function desiredStateRequest(
  detail: FeedDetailResult | null,
  kind: "like" | "favorite",
  active: boolean,
): FeedInteractionRequest | null {
  const target = targetOf(detail);
  return target
    ? {
        path: kind === "like" ? "/xhs/feeds/like" : "/xhs/feeds/favorite",
        payload: { ...target, active },
      }
    : null;
}

/**
 * 构造发表评论请求。
 *
 * @param detail 当前打开的帖子详情。
 * @param content 评论正文。
 * @returns 请求描述；没有打开详情时为空。
 */
export function commentRequest(
  detail: FeedDetailResult | null,
  content: string,
): FeedInteractionRequest | null {
  const target = targetOf(detail);
  return target ? { path: "/xhs/feeds/comment", payload: { ...target, content } } : null;
}

/**
 * 构造回复评论请求。
 *
 * @param detail 当前打开的帖子详情。
 * @param commentId 被回复的评论标识。
 * @param content 回复正文。
 * @returns 请求描述；没有打开详情时为空。
 */
export function replyRequest(
  detail: FeedDetailResult | null,
  commentId: string,
  content: string,
): FeedInteractionRequest | null {
  const target = targetOf(detail);
  return target
    ? {
        path: "/xhs/feeds/comment/reply",
        payload: { ...target, content, comment_id: commentId, user_id: null },
      }
    : null;
}

/** 写操作成功后应更新的详情指标字段。 */
export function metricKeyOf(kind: "like" | "favorite"): "liked" | "collected" {
  return kind === "like" ? "liked" : "collected";
}
