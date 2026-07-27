import { resolveInstallationId } from "./installation-id";
import type { ExtensionCredential } from "./publication-types";

const CREDENTIAL_KEY = "extensionCredential";
const LEGACY_CREDENTIAL_KEY = "publicationCredential";
let credentialIssue: Promise<ExtensionCredential> | undefined;

type CredentialIssuer = (
  baseUrl: string,
  extensionId: string,
  installationId: string,
) => Promise<ExtensionCredential>;

/** 读取本机服务签发的共享扩展能力令牌。 */
export async function loadExtensionCredential(): Promise<ExtensionCredential | undefined> {
  const stored = await chrome.storage.local.get([CREDENTIAL_KEY, LEGACY_CREDENTIAL_KEY]);
  const value = (stored[CREDENTIAL_KEY] ?? stored[LEGACY_CREDENTIAL_KEY]) as
    Partial<ExtensionCredential> | undefined;
  if (typeof value?.extensionId !== "string" || typeof value.token !== "string") {
    return undefined;
  }
  return {
    extensionId: value.extensionId,
    token: value.token,
    // 安装标识必须一并带出, 丢了会被当成旧凭据反复重新登记。
    ...(typeof value.installationId === "string" ? { installationId: value.installationId } : {}),
  };
}

/** 保存发布和通用浏览器任务共用的扩展能力令牌。 */
export async function saveExtensionCredential(credential: ExtensionCredential): Promise<void> {
  await chrome.storage.local.set({ [CREDENTIAL_KEY]: credential });
  await chrome.storage.local.remove(LEGACY_CREDENTIAL_KEY);
}

/** 清除已失效的共享扩展能力令牌。 */
export async function clearExtensionCredential(): Promise<void> {
  await chrome.storage.local.remove([CREDENTIAL_KEY, LEGACY_CREDENTIAL_KEY]);
}

/** 防止多个后台任务同时登记并相互轮换能力令牌。 */
export async function ensureExtensionCredential(
  baseUrl: string,
  issuer: CredentialIssuer,
): Promise<ExtensionCredential> {
  const extensionId = chrome.runtime.id;
  const stored = await loadExtensionCredential();
  // 旧凭据没有安装标识, 必须重新登记一次才能拿到按实例存储的令牌。
  if (stored?.extensionId === extensionId && stored.installationId) return stored;
  if (!credentialIssue) {
    // 安装标识只在真要登记时解析, 避免每次启动都写一遍存储。
    credentialIssue = resolveInstallationId(chrome.storage.local)
      .then((installationId) => issuer(baseUrl, extensionId, installationId))
      .then(async (credential) => {
        await saveExtensionCredential(credential);
        return credential;
      })
      .finally(() => {
        credentialIssue = undefined;
      });
  }
  return credentialIssue;
}
