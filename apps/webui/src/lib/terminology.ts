/**
 * 界面术语与状态文案的唯一来源。
 *
 * 同一件事在不同页面必须用同一个词。此前"下载完成"在三处分别写作
 * 已完成、已下载和完成，"结果待人工核对"在两处分别写作需要确认和
 * 待确认，用户会以为它们是不同状态。
 *
 * 文案面向普通用户：不出现驱动、执行器、租约、提供方、指纹、领取等
 * 内部概念，也不出现任务标识片段等只对排查有意义的信息。
 */

/** 内容对象的统一称呼；后端字段仍叫作品，界面一律称帖子。 */
export const POST_NOUN = "帖子";

/**
 * 清除浏览器站点 Cookie 这一动作的统一叫法。
 *
 * 它对用户的实际效果就是退出登录；此前操作按钮写“清除浏览器 Cookie”、
 * 动态记录里写“退出登录”，同一件事看起来像两件。
 */
export const LOGOUT_ACTION = "退出登录";

/** 下载任务在界面上的状态。 */
type DownloadStatusKey = "queued" | "running" | "completed" | "failed";

/** 发布任务在界面上的状态。 */
type PublishStatusKey =
  | "scheduled"
  | "ready"
  | "claimed"
  | "filling"
  | "publishing"
  | "awaiting_verification"
  | "published"
  | "needs_review"
  | "failed"
  | "canceled";

/** 浏览操作在界面上的状态。 */
export type BrowseStatusKey =
  "queued" | "claimed" | "running" | "succeeded" | "failed" | "needs_review" | "canceled";

/**
 * 一条状态的完整表达。
 *
 * `hint` 说明用户现在该做什么；只有需要用户采取行动时才提供，
 * 进行中和已成功的状态不写多余提示。
 */
interface StatusCopy {
  label: string;
  hint?: string;
}

export const downloadStatusCopy: Record<DownloadStatusKey, StatusCopy> = {
  queued: { label: "排队中" },
  running: { label: "下载中" },
  completed: { label: "已下载" },
  failed: {
    label: "下载失败",
    // “可以重新下载”与旁边常驻的重试按钮重复，只留真正补充信息的那半句。
    hint: "多次失败就检查一下网络，或者过一会儿再试。",
  },
};

export const publishStatusCopy: Record<PublishStatusKey, StatusCopy> = {
  scheduled: { label: "等待到点" },
  ready: { label: "准备发布" },
  claimed: { label: "准备发布" },
  filling: { label: "正在填写内容" },
  publishing: { label: "正在发布" },
  awaiting_verification: {
    label: "等待你完成验证",
    hint: "小红书要求扫码或安全验证，请在打开的创作页面完成后回来继续。",
  },
  published: { label: "已发布" },
  needs_review: {
    label: "需要你确认结果",
    hint: "已经点了发布，但没能确认结果。请到小红书创作中心看一眼，再告诉我们发出去了没有。",
  },
  failed: { label: "发布失败", hint: "可以重新发布。" },
  canceled: { label: "已取消" },
};

export const browseStatusCopy: Record<BrowseStatusKey, StatusCopy> = {
  queued: { label: "排队中" },
  claimed: { label: "准备中" },
  running: { label: "进行中" },
  succeeded: { label: "已完成" },
  failed: { label: "失败", hint: "可以重试。" },
  needs_review: {
    label: "需要你确认结果",
    hint: "这次操作可能已经生效。请到小红书看一眼实际结果，再告诉我们成没成功，不要直接重试。",
  },
  canceled: { label: "已取消" },
};

/** 帖子卡片上的下载状态，与下载任务共用同一套说法。 */
export const postStatusCopy: Record<"ready" | "downloading" | "done" | "error", StatusCopy> = {
  ready: { label: "未下载" },
  downloading: { label: "下载中" },
  done: { label: "已下载" },
  error: { label: "下载失败" },
};

/**
 * 连接小红书的方式。
 *
 * 对应后端的浏览器驱动，但用户不需要知道"驱动"这个词，
 * 只需要知道是用自己的浏览器还是用软件自带的浏览器。
 */
export const connectionCopy = {
  extension: {
    label: "我自己的浏览器",
    description: "安装一个浏览器插件，用你平时登录的账号。",
  },
  managed: {
    label: "软件自带浏览器",
    description: "不装插件，软件会打开一个专用浏览器窗口供你扫码登录。",
  },
} as const;

/**
 * 把服务端返回的原始错误整理成用户能读懂的一句话。
 *
 * 服务端消息以排查为目的，含 HTTP 状态码和内部概念；这里在保留
 * 原意的前提下换成日常说法，无法识别时按原文返回而不是吞掉。
 *
 * @param message 服务端或网络层返回的原始消息。
 * @returns 面向用户的消息。
 */
export function humanizeError(message: string): string {
  const rules: [RegExp, string][] = [
    [/请求失败（HTTP 5\d\d）/, "本地服务出错了，请稍后重试。"],
    [/请求失败（HTTP 40[13]）/, "这个操作只能在本机使用。"],
    [/请求失败（HTTP 404）/, "没有找到对应的内容。"],
    [/Failed to fetch|NetworkError|fetch failed/i, "连接不上本地服务，请确认它正在运行。"],
    [/尚未支持.*任务/, "当前连接方式不支持这个操作，换一种连接方式即可。"],
    [/结果无法确认.*人工核对/, "这次操作可能已经生效，需要你确认一下。"],
    [/执行失败，可安全重试/, "这次没有成功，可以直接重试。"],
    [/浏览器任务暂时无法提交/, "现在提交不了，稍后再试。"],
    // 术语例外：这里是拿内部词去匹配服务端原文，正是为了把它翻译掉。
    [/浏览器执行器|驱动/, "还没有选好连接小红书的方式，请先到设置里完成。"],
  ];
  for (const [pattern, friendly] of rules) {
    if (pattern.test(message)) return friendly;
  }
  return message;
}
