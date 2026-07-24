import type {
  ExtensionCredential,
  PublicationClaim,
} from "./publication-types";

const CREDENTIAL_KEY = "publicationCredential";
const ACTIVE_CLAIM_KEY = "activePublicationClaim";
const ACTIVE_OWNER_KEY = "activePublicationOwner";

export async function loadPublicationCredential(): Promise<
  ExtensionCredential | undefined
> {
  const stored = await chrome.storage.local.get(CREDENTIAL_KEY);
  const value = stored[CREDENTIAL_KEY] as Partial<ExtensionCredential> | undefined;
  if (
    typeof value?.extensionId !== "string" ||
    typeof value.token !== "string"
  ) {
    return undefined;
  }
  return { extensionId: value.extensionId, token: value.token };
}

export async function savePublicationCredential(
  credential: ExtensionCredential,
): Promise<void> {
  await chrome.storage.local.set({ [CREDENTIAL_KEY]: credential });
}

export async function clearPublicationCredential(): Promise<void> {
  await chrome.storage.local.remove(CREDENTIAL_KEY);
}

export async function loadActivePublicationClaim(): Promise<
  PublicationClaim | undefined
> {
  const stored = await chrome.storage.local.get(ACTIVE_CLAIM_KEY);
  const value = stored[ACTIVE_CLAIM_KEY] as Partial<PublicationClaim> | undefined;
  if (
    typeof value?.lease_token !== "string" ||
    typeof value.task?.task_id !== "string"
  ) {
    return undefined;
  }
  return value as PublicationClaim;
}

export async function saveActivePublicationClaim(
  claim: PublicationClaim,
): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_CLAIM_KEY]: claim });
}

export async function clearActivePublicationClaim(): Promise<void> {
  await chrome.storage.local.remove([ACTIVE_CLAIM_KEY, ACTIVE_OWNER_KEY]);
}

export async function loadActivePublicationOwner(): Promise<
  number | undefined
> {
  const stored = await chrome.storage.local.get(ACTIVE_OWNER_KEY);
  const value = stored[ACTIVE_OWNER_KEY];
  return Number.isInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined;
}

export async function saveActivePublicationOwner(tabId: number): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_OWNER_KEY]: tabId });
}
