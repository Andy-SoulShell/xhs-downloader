import { readLiveInitialState } from "./browser-state-bridge";
import {
  isValidAccountId,
  readCurrentNavigationAccountId,
} from "./current-account-navigation";
import { dataRecord, dataText, unwrapState } from "./page-data";

const PROOF_CONTEXT = "xhs-account-challenge/v1\0";

/** 浏览器隔离环境接收的一次性账号挑战。 */
export interface BrowserAccountChallenge {
  challengeId: string;
  challengeKey: string;
}

/** 浏览器返回给本机服务的脱敏账号证明。 */
export type BrowserAccountProof =
  | { status: "proved"; proof: string }
  | { status: "logged_out" }
  | { status: "unverified" };

/** 后台发送给小红书内容脚本的一次性证明请求。 */
export interface BrowserAccountChallengeRequest {
  type: "browser-account-challenge";
  challenge: BrowserAccountChallenge;
}

/** 判断消息是否为一次性账号挑战。 */
export function isBrowserAccountChallengeRequest(
  value: { type?: string },
): value is BrowserAccountChallengeRequest {
  return value.type === "browser-account-challenge";
}

/** 从页面实时状态生成 HMAC，不把稳定账号标识返回给调用方。 */
export async function proveBrowserAccount(
  page: Document,
  challenge: BrowserAccountChallenge,
): Promise<BrowserAccountProof> {
  if (!/^[0-9a-f]{32}$/.test(challenge.challengeId)) {
    return { status: "unverified" };
  }
  let state: Record<string, unknown> = {};
  try {
    state = await readLiveInitialState(page);
  } catch {
    // 当前页面完成水合后可能移除初始状态，继续使用严格的当前用户导航兜底。
  }
  const user = dataRecord(state.user);
  const info = dataRecord(unwrapState(user.userInfo));
  if (info.guest === true) return { status: "logged_out" };
  const stateAccountId = dataText(info.userId ?? info.user_id);
  const accountId =
    info.guest === false && isValidAccountId(stateAccountId)
      ? stateAccountId
      : readCurrentNavigationAccountId(page);
  if (!accountId) {
    return { status: "unverified" };
  }
  try {
    return {
      status: "proved",
      proof: await hmacProof(challenge, accountId),
    };
  } catch {
    return { status: "unverified" };
  }
}

async function hmacProof(
  challenge: BrowserAccountChallenge,
  accountId: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase64Url(challenge.challengeKey),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const message = new TextEncoder().encode(
    `${PROOF_CONTEXT}${challenge.challengeId}\0${accountId}`,
  );
  const digest = await crypto.subtle.sign("HMAC", key, message);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const decoded = atob(padded);
  const buffer = new ArrayBuffer(decoded.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return buffer;
}
