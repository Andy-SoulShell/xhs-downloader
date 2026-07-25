const PUBLISH_CONTROL = Symbol.for("xhs-downloader.publisher-control");
const PREPARED_MESSAGE = "创作平台发布按钮已准备";

type PublishControlScope = typeof globalThis & {
  [PUBLISH_CONTROL]?: (action: "prepare") => {
    ok?: boolean;
    message?: string;
  };
};

/**
 * 确认封闭影子根内的真实发布按钮仍可直接激活。
 */
export function prepareManagedPublishControl(): {
  ok: boolean;
  message: string;
} {
  try {
    const result = (globalThis as PublishControlScope)[PUBLISH_CONTROL]?.(
      "prepare",
    );
    if (result?.ok === true && result.message === PREPARED_MESSAGE) {
      return { ok: true, message: result.message };
    }
  } catch {
    // 页面桥接异常统一收敛为固定失败响应，避免泄露页面内容。
  }
  return { ok: false, message: "创作平台发布按钮未能准备" };
}
