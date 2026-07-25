import type { CommentResult } from "@xhs-downloader/contracts";

import { UncertainBrowserActionError } from "./browser-action-errors";

const COMMENT_ELEMENTS =
  ".comments-container .parent-comment, .comments-container .comment-item";

interface ReplyTarget {
  commentId: string | null;
  userId: string | null;
}

/** 发表评论，并确认评论区新增了对应文本。 */
export async function postComment(
  page: Document,
  feedId: string,
  content: string,
): Promise<CommentResult> {
  return submitComment(page, feedId, content);
}

/** 定位目标评论、进入回复态并确认回复已经渲染。 */
export async function replyComment(
  page: Document,
  feedId: string,
  content: string,
  target: ReplyTarget,
): Promise<CommentResult> {
  const comment = await findTargetCommentWithLoading(page, target);
  if (!comment) throw new Error("评论区没有找到回复目标");
  comment.scrollIntoView?.({ block: "center" });
  const reply = comment.querySelector<HTMLElement>(
    ".right .interactions .reply, .interactions .reply, .reply",
  );
  if (!reply) throw new Error("目标评论没有回复按钮");
  reply.click();
  await delay(150);
  return submitComment(page, feedId, content);
}

async function findTargetCommentWithLoading(
  page: Document,
  target: ReplyTarget,
): Promise<HTMLElement | null> {
  const container = page.querySelector<HTMLElement>(".comments-container");
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const match = findTargetComment(page, target);
    if (match) return match;
    if (
      !container ||
      page.querySelector(
        ".comments-container .end-container, .comments-container .no-more",
      )
    ) {
      return null;
    }
    const comments = page.querySelectorAll<HTMLElement>(COMMENT_ELEMENTS);
    comments.item(comments.length - 1)?.scrollIntoView?.({ block: "end" });
    container.scrollTop = container.scrollHeight;
    page.defaultView?.scrollBy(0, page.defaultView.innerHeight * 0.8);
    await delay(250);
  }
  return null;
}

async function submitComment(
  page: Document,
  feedId: string,
  content: string,
): Promise<CommentResult> {
  const before = matchingComments(page, content).length;
  const activator = page.querySelector<HTMLElement>(
    "div.input-box div.content-edit span",
  );
  activator?.click();
  const input = page.querySelector<HTMLElement>(
    "div.input-box div.content-edit p.content-input, div.input-box [contenteditable='true']",
  );
  if (!input) throw new Error("页面没有可用的评论输入框");
  fillContentEditable(page, input, content);
  const submit = page.querySelector<HTMLButtonElement>("div.bottom button.submit");
  if (!submit || submit.disabled) throw new Error("评论提交按钮当前不可用");
  submit.click();
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const matches = matchingComments(page, content);
    if (matches.length > before) {
      return {
        feed_id: feedId,
        comment_id: commentId(matches.at(-1) ?? null),
        verified: true,
      };
    }
    await delay(250);
  }
  throw new UncertainBrowserActionError(
    "评论提交已触发，但未在评论区确认结果，请人工核对",
  );
}

function findTargetComment(
  page: Document,
  target: ReplyTarget,
): HTMLElement | null {
  if (target.commentId) {
    const direct = page.getElementById(`comment-${target.commentId}`);
    if (direct instanceof HTMLElement) return direct;
  }
  if (!target.userId) return null;
  return (
    [...page.querySelectorAll<HTMLElement>(COMMENT_ELEMENTS)].find((item) =>
      [...item.querySelectorAll<HTMLElement>("[data-user-id]")].some(
        (user) => user.dataset.userId === target.userId,
      ),
    ) ?? null
  );
}

function fillContentEditable(
  page: Document,
  input: HTMLElement,
  content: string,
): void {
  input.focus();
  input.textContent = content;
  const scope = page.defaultView;
  const event = scope
    ? new scope.InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: content,
      })
    : new Event("input", { bubbles: true });
  input.dispatchEvent(event);
}

function matchingComments(page: Document, content: string): HTMLElement[] {
  const expected = normalize(content);
  return [...page.querySelectorAll<HTMLElement>(COMMENT_ELEMENTS)].filter(
    (item) => normalize(item.textContent ?? "").includes(expected),
  );
}

function commentId(element: HTMLElement | null): string | null {
  if (!element) return null;
  return (
    element.dataset.commentId ??
    (element.id.startsWith("comment-") ? element.id.slice(8) : null)
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
