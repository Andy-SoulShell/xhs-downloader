interface CommentLoadOptions {
  commentLimit: number;
  includeReplies: boolean;
  replyLimit: number;
}

const COMMENT_SELECTOR = ".comments-container .parent-comment";
const END_SELECTOR = ".comments-container .end-container, .comments-container .no-more";

/** 判断详情任务是否需要操作评论区而非只读首屏状态。 */
export function needsCommentLoading(options: CommentLoadOptions): boolean {
  return options.commentLimit > 10 || options.includeReplies;
}

/** 在明确上限内滚动评论区并展开适量回复。 */
export async function loadComments(
  page: Document,
  options: CommentLoadOptions,
): Promise<void> {
  if (!needsCommentLoading(options) || options.commentLimit === 0) return;
  const container = page.querySelector<HTMLElement>(".comments-container");
  if (!container) throw new Error("详情页评论区尚未加载");
  const maxAttempts = Math.min(30, Math.max(4, options.commentLimit + 2));
  let stagnantRounds = 0;
  let previousCount = -1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const comments = [...page.querySelectorAll<HTMLElement>(COMMENT_SELECTOR)];
    if (options.includeReplies) {
      expandReplies(comments, options.replyLimit);
    }
    if (
      comments.length >= options.commentLimit ||
      page.querySelector(END_SELECTOR)
    ) {
      return;
    }
    stagnantRounds =
      comments.length === previousCount ? stagnantRounds + 1 : 0;
    if (stagnantRounds >= 4) return;
    previousCount = comments.length;
    const last = comments.at(-1);
    last?.scrollIntoView?.({ block: "end" });
    container.scrollTop = container.scrollHeight;
    page.defaultView?.scrollBy(0, page.defaultView.innerHeight * 0.8);
    await delay(250);
  }
}

function expandReplies(comments: HTMLElement[], replyLimit: number): void {
  if (replyLimit <= 0) return;
  let clicked = 0;
  for (const comment of comments) {
    if (clicked >= replyLimit) return;
    const control = comment.querySelector<HTMLElement>(".show-more");
    if (!control || control.dataset.xhdExpanded === "true") continue;
    control.dataset.xhdExpanded = "true";
    control.click();
    clicked += 1;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
