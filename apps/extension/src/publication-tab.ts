const DEFAULT_CLOSE_DELAY = 800;

export function schedulePublicationTabClose(tabId: number, delay = DEFAULT_CLOSE_DELAY): void {
  globalThis.setTimeout(() => {
    void chrome.tabs.remove(tabId).catch(() => undefined);
  }, delay);
}
