import { DEFAULT_SERVICE_URL } from "./service";
import type {
  BrowserDownloadBatch,
  ClientDownloadRecord,
  DownloadPreference,
  ExtensionSettings,
} from "./types";

const SETTINGS_KEY = "settings";
const RECORDS_KEY = "pendingRecords";
const BATCHES_KEY = "browserDownloadBatches";
const MAX_PENDING_RECORDS = 500;
const MAX_TRACKED_BATCHES = 100;

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

export async function appendPendingRecord(record: ClientDownloadRecord): Promise<void> {
  const records = await loadPendingRecords();
  const next = [record, ...records.filter((item) => item.record_id !== record.record_id)].slice(
    0,
    MAX_PENDING_RECORDS,
  );
  await chrome.storage.local.set({ [RECORDS_KEY]: next });
}

export async function removePendingRecords(recordIds: string[]): Promise<void> {
  const ids = new Set(recordIds);
  const records = await loadPendingRecords();
  await chrome.storage.local.set({
    [RECORDS_KEY]: records.filter((record) => !ids.has(record.record_id)),
  });
}

/** 读取尚未确认结果的浏览器下载批次。 */
export async function loadDownloadBatches(): Promise<BrowserDownloadBatch[]> {
  const stored = await chrome.storage.local.get(BATCHES_KEY);
  const batches = stored[BATCHES_KEY];
  return Array.isArray(batches) ? (batches as BrowserDownloadBatch[]) : [];
}

/** 登记一个等待浏览器回报结果的下载批次。 */
export async function appendDownloadBatch(batch: BrowserDownloadBatch): Promise<void> {
  const batches = await loadDownloadBatches();
  const next = [batch, ...batches.filter((item) => item.batch_id !== batch.batch_id)].slice(
    0,
    MAX_TRACKED_BATCHES,
  );
  await chrome.storage.local.set({ [BATCHES_KEY]: next });
}

/** 移除已经确认结果的下载批次。 */
export async function removeDownloadBatches(batchIds: string[]): Promise<void> {
  const ids = new Set(batchIds);
  const batches = await loadDownloadBatches();
  await chrome.storage.local.set({
    [BATCHES_KEY]: batches.filter((batch) => !ids.has(batch.batch_id)),
  });
}
