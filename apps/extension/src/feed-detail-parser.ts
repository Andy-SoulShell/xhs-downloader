import type {
  FeedComment,
  FeedDetailResult,
} from "@xhs-downloader/contracts";

import { parseFeedAuthor, parseFeedMetrics } from "./feed-parser";
import {
  dataBoolean,
  dataInteger,
  dataList,
  dataRecord,
  dataText,
  dataUrl,
  latestInitialState,
  unwrapState,
} from "./page-data";

interface DetailOptions {
  feedId: string;
  xsecToken: string;
  commentLimit: number;
  includeReplies: boolean;
  replyLimit: number;
}

/** 从帖子详情页解析正文、媒体、互动状态和当前已加载评论。 */
export function parseFeedDetailDocument(
  page: Document,
  options: DetailOptions,
): FeedDetailResult {
  const state = latestInitialState(page);
  const noteState = dataRecord(state.note);
  const detailMap = dataRecord(noteState.noteDetailMap);
  const wrapper = findDetail(detailMap, options.feedId);
  const note = dataRecord(wrapper.note);
  const author = parseFeedAuthor(note.user);
  if (!author || dataText(note.noteId) !== options.feedId) {
    throw new Error("详情页数据与请求的帖子不一致");
  }
  const comments = dataRecord(unwrapState(wrapper.comments));
  return {
    feed_id: options.feedId,
    xsec_token: dataText(note.xsecToken) || options.xsecToken,
    title: dataText(note.title),
    body: dataText(note.desc),
    note_type: noteType(note.type),
    author,
    metrics: parseFeedMetrics(note.interactInfo),
    image_urls: dataList(note.imageList)
      .map((item) => {
        const image = dataRecord(item);
        return dataUrl(image.urlDefault ?? image.urlPre ?? image.url);
      })
      .filter((url): url is string => url !== null),
    published_at: dataInteger(note.time),
    ip_location: dataText(note.ipLocation),
    comments: dataList(unwrapState(comments.list))
      .slice(0, options.commentLimit)
      .map((item) =>
        parseComment(item, options.includeReplies, options.replyLimit),
      )
      .filter((item): item is FeedComment => item !== null),
    comments_has_more: dataBoolean(comments.hasMore),
    comments_cursor: dataText(comments.cursor),
  };
}

function findDetail(
  detailMap: Record<string, unknown>,
  feedId: string,
): Record<string, unknown> {
  const direct = dataRecord(detailMap[feedId]);
  if (Object.keys(direct).length) return direct;
  const match = Object.values(detailMap)
    .map(dataRecord)
    .find((item) => dataText(dataRecord(item.note).noteId) === feedId);
  if (!match) throw new Error("详情页没有请求的帖子数据");
  return match;
}

function parseComment(
  value: unknown,
  includeReplies: boolean,
  replyLimit: number,
): FeedComment | null {
  const comment = dataRecord(value);
  const author = parseFeedAuthor(comment.userInfo);
  const commentId = dataText(comment.id);
  if (!commentId || !author) return null;
  const replies = includeReplies
    ? dataList(unwrapState(comment.subComments))
        .slice(0, replyLimit)
        .map((item) => parseComment(item, false, 0))
        .filter((item): item is FeedComment => item !== null)
    : [];
  return {
    comment_id: commentId,
    content: dataText(comment.content),
    author,
    liked: dataBoolean(comment.liked),
    like_count: dataText(comment.likeCount) || "0",
    created_at: dataInteger(comment.createTime),
    ip_location: dataText(comment.ipLocation),
    reply_count: dataText(comment.subCommentCount) || String(replies.length),
    replies,
  };
}

function noteType(value: unknown): FeedDetailResult["note_type"] {
  const type = dataText(value).toLowerCase();
  if (type === "video") return "video";
  if (type === "normal" || type === "image") return "image";
  return "unknown";
}
