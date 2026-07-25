import type { ExtensionCredential } from "./publication-types";

const CREDENTIAL_KEY = "extensionCredential";
const LEGACY_CREDENTIAL_KEY = "publicationCredential";
let credentialIssue: Promise<ExtensionCredential> | undefined;

type CredentialIssuer = (
  baseUrl: string,
  extensionId: string,
) => Promise<ExtensionCredential>;

/** 读取本机服务签发的共享扩展能力令牌。 */
export async function loadExtensionCredential(): Promise<
  ExtensionCredential | undefined
> {
  const stored = await chrome.storage.local.get([
    CREDENTIAL_KEY,
    LEGACY_CREDENTIAL_KEY,
  ]);
  const value = (stored[CREDENTIAL_KEY] ??
    stored[LEGACY_CREDENTIAL_KEY]) as
    | Partial<ExtensionCredential>
    | undefined;
  if (
    typeof value?.extensionId !== "string" ||
    typeof value.token !== "string"
  ) {
    return undefined;
  }
  return { extensionId: value.extensionId, token: value.token };
}

/** 保存发布和通用浏览器任务共用的扩展能力令牌。 */
export async function saveExtensionCredential(
  credential: ExtensionCredential,
): Promise<void> {
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
  if (stored?.extensionId === extensionId) return stored;
  if (!credentialIssue) {
    credentialIssue = issuer(baseUrl, extensionId)
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
