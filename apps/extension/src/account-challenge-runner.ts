import {
  answerAccountChallenge,
  claimAccountChallenge,
  supportsAccountChallenges,
  type ExtensionAccountChallengeClaim,
} from "./account-challenge-service";
import { type BrowserAccountChallengeRequest, type BrowserAccountProof } from "./account-proof";
import { BrowserTaskUnauthorizedError, registerBrowserExtension } from "./browser-task-service";
import { clearExtensionCredential, ensureExtensionCredential } from "./extension-credential";
import type { ExtensionCredential } from "./publication-types";
import { loadSettings } from "./storage";

const POLL_ALARM = "browser-account-challenge-poll";
const EXPLORE_URL = "https://www.xiaohongshu.com/explore/";
const PAGE_READY_ATTEMPTS = 20;
const CLAIM_WAIT_SECONDS = 25;

let pollOperation: Promise<void> | undefined;

/** 安装不落盘账号挑战的启动与定时轮询。 */
export function installAccountChallengeAutomation(): void {
  chrome.runtime.onInstalled.addListener(() => void configurePolling());
  chrome.runtime.onStartup.addListener(() => void configurePolling());
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM) void runAccountChallengePoll();
  });
  void configurePolling();
}

/** 执行一次防重入的账号挑战长轮询。 */
export async function runAccountChallengePoll(): Promise<void> {
  if (pollOperation) return pollOperation;
  pollOperation = performPoll().finally(() => {
    pollOperation = undefined;
  });
  return pollOperation;
}

async function configurePolling(): Promise<void> {
  await chrome.alarms.create(POLL_ALARM, {
    delayInMinutes: 0.5,
    periodInMinutes: 0.5,
  });
  await runAccountChallengePoll();
}

async function performPoll(): Promise<void> {
  try {
    const settings = await loadSettings();
    if (!(await supportsAccountChallenges(settings.serviceUrl))) return;
    const claim = await withCredential((credential) =>
      claimAccountChallenge(settings.serviceUrl, credential, CLAIM_WAIT_SECONDS),
    );
    if (!claim) return;
    const answer = await executeChallenge(claim);
    await withCredential((credential) =>
      answerAccountChallenge(settings.serviceUrl, credential, claim, answer),
    );
  } catch {
    // 服务离线、挑战失效或页面尚未就绪时由服务端按超时安全收敛。
  }
}

async function executeChallenge(
  claim: ExtensionAccountChallengeClaim,
): Promise<BrowserAccountProof> {
  const request: BrowserAccountChallengeRequest = {
    type: "browser-account-challenge",
    challenge: {
      challengeId: claim.challenge_id,
      challengeKey: claim.challenge_key,
    },
  };
  const tabs = (await chrome.tabs.query({}))
    .filter((item) => item.id !== undefined)
    .sort((left, right) => Number(right.active) - Number(left.active));
  for (const tab of tabs) {
    try {
      return validateProof(
        await chrome.tabs.sendMessage<BrowserAccountChallengeRequest, BrowserAccountProof>(
          tab.id as number,
          request,
        ),
      );
    } catch {
      // 只有已注入小红书内容脚本的页面会响应。
    }
  }
  const tab = await chrome.tabs.create({ url: EXPLORE_URL, active: false });
  if (tab.id === undefined) return { status: "unverified" };
  const tabId = tab.id;
  try {
    for (let attempt = 0; attempt < PAGE_READY_ATTEMPTS; attempt += 1) {
      try {
        return validateProof(
          await chrome.tabs.sendMessage<BrowserAccountChallengeRequest, BrowserAccountProof>(
            tabId,
            request,
          ),
        );
      } catch {
        await delay(250);
      }
    }
    return { status: "unverified" };
  } finally {
    await chrome.tabs.remove(tabId);
  }
}

function validateProof(value: unknown): BrowserAccountProof {
  if (!value || typeof value !== "object") return { status: "unverified" };
  const proof = value as { status?: unknown; proof?: unknown };
  if (proof.status === "logged_out") return { status: "logged_out" };
  if (
    proof.status === "proved" &&
    typeof proof.proof === "string" &&
    /^[0-9a-f]{64}$/.test(proof.proof)
  ) {
    return { status: "proved", proof: proof.proof };
  }
  return { status: "unverified" };
}

async function withCredential<T>(
  operation: (credential: ExtensionCredential) => Promise<T>,
): Promise<T> {
  const settings = await loadSettings();
  let credential = await ensureExtensionCredential(settings.serviceUrl, registerBrowserExtension);
  try {
    return await operation(credential);
  } catch (error) {
    if (!(error instanceof BrowserTaskUnauthorizedError)) throw error;
    await clearExtensionCredential();
    credential = await ensureExtensionCredential(settings.serviceUrl, registerBrowserExtension);
    return operation(credential);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
