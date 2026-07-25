import {
  executeBrowserPageTask,
  isBrowserPageTaskRequest,
  type BrowserPageTaskResponse,
} from "./browser-page-runner";
import {
  isBrowserAccountChallengeRequest,
  proveBrowserAccount,
  type BrowserAccountProof,
} from "./account-proof";
import { UncertainBrowserActionError } from "./browser-action-errors";
import { buildPageCompatibilityDiagnostics } from "./browser-page-diagnostics";
import { requestBrowserInteraction } from "./browser-interaction-input";

chrome.runtime.onMessage.addListener(
  (
    message: { type?: string },
    _sender,
    sendResponse: (
      response: BrowserPageTaskResponse | BrowserAccountProof,
    ) => void,
  ) => {
    if (isBrowserAccountChallengeRequest(message)) {
      void proveBrowserAccount(document, message.challenge)
        .then(sendResponse)
        .catch(() => sendResponse({ status: "unverified" }));
      return true;
    }
    if (!isBrowserPageTaskRequest(message)) return;
    void executeBrowserPageTask(message.task, document, location.href, {
      activateInteraction: requestBrowserInteraction,
    })
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : "页面数据解析失败",
          status:
            error instanceof UncertainBrowserActionError
              ? "needs_review"
              : "failed",
          result: buildPageCompatibilityDiagnostics(document, location.href),
        }),
      );
    return true;
  },
);
