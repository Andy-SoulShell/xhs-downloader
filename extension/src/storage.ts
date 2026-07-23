import { DEFAULT_SERVICE_URL } from "./service";
import type {
  ClientDownloadRecord,
  DownloadPreference,
  ExtensionSettings,
} from "./types";

const SETTINGS_KEY = "settings";
const RECORDS_KEY = "pendingRecords";
const MAX_PENDING_RECORDS = 500;

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
  return {
    mode: settings?.mode ?? "auto",
    serviceUrl: settings?.serviceUrl ?? DEFAULT_SERVICE_URL,
  };
}

export async function saveMode(mode: DownloadPreference): Promise<void> {
  const settings = await loadSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...settings, mode },
  });
}

export async function loadPendingRecords(): Promise<ClientDownloadRecord[]> {
  const stored = await chrome.storage.local.get(RECORDS_KEY);
  const records = stored[RECORDS_KEY];
  return Array.isArray(records) ? (records as ClientDownloadRecord[]) : [];
}

export async function appendPendingRecord(
  record: ClientDownloadRecord,
): Promise<void> {
  const records = await loadPendingRecords();
  const next = [
    record,
    ...records.filter((item) => item.record_id !== record.record_id),
  ].slice(0, MAX_PENDING_RECORDS);
  await chrome.storage.local.set({ [RECORDS_KEY]: next });
}

export async function removePendingRecords(recordIds: string[]): Promise<void> {
  const ids = new Set(recordIds);
  const records = await loadPendingRecords();
  await chrome.storage.local.set({
    [RECORDS_KEY]: records.filter((record) => !ids.has(record.record_id)),
  });
}
