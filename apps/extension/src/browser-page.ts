import {
  executeBrowserPageTask,
  isBrowserPageTaskRequest,
  type BrowserPageTaskResponse,
} from "./browser-page-runner";
import { UncertainBrowserActionError } from "./browser-action-errors";

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string },
    _sender,
    sendResponse: (response: BrowserPageTaskResponse) => void,
  ) => {
    if (!isBrowserPageTaskRequest(message)) return;
    void executeBrowserPageTask(message.task, document, location.href)
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : "页面数据解析失败",
          status:
            error instanceof UncertainBrowserActionError
              ? "needs_review"
              : "failed",
        }),
      );
    return true;
  },
);
