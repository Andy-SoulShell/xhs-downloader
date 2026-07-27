import type { ExtensionCredential, PublicationClaim } from "./publication-types";
import {
  clearExtensionCredential,
  loadExtensionCredential,
  saveExtensionCredential,
} from "./extension-credential";

const ACTIVE_CLAIM_KEY = "activePublicationClaim";
const ACTIVE_OWNER_KEY = "activePublicationOwner";

export async function loadPublicationCredential(): Promise<ExtensionCredential | undefined> {
  return loadExtensionCredential();
}

export async function savePublicationCredential(credential: ExtensionCredential): Promise<void> {
  await saveExtensionCredential(credential);
}

export async function clearPublicationCredential(): Promise<void> {
  await clearExtensionCredential();
}

export async function loadActivePublicationClaim(): Promise<PublicationClaim | undefined> {
  const stored = await chrome.storage.local.get(ACTIVE_CLAIM_KEY);
  const value = stored[ACTIVE_CLAIM_KEY] as Partial<PublicationClaim> | undefined;
  if (typeof value?.lease_token !== "string" || typeof value.task?.task_id !== "string") {
    return undefined;
  }
  return value as PublicationClaim;
}

export async function saveActivePublicationClaim(claim: PublicationClaim): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_CLAIM_KEY]: claim });
}

export async function clearActivePublicationClaim(): Promise<void> {
  await chrome.storage.local.remove([ACTIVE_CLAIM_KEY, ACTIVE_OWNER_KEY]);
}

export async function loadActivePublicationOwner(): Promise<number | undefined> {
  const stored = await chrome.storage.local.get(ACTIVE_OWNER_KEY);
  const value = stored[ACTIVE_OWNER_KEY];
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

export async function saveActivePublicationOwner(tabId: number): Promise<void> {
  await chrome.storage.local.set({ [ACTIVE_OWNER_KEY]: tabId });
}
