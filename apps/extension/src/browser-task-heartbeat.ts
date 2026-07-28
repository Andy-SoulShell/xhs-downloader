import type { BrowserTaskClaim } from "@xhs-downloader/contracts";

const DEFAULT_LEASE_SECONDS = 30;
const MAX_HEARTBEAT_INTERVAL_MS = 15_000;
const MIN_DECLARED_LEASE_SECONDS = 0.01;

/** 执行中浏览器任务的可停止续租控制器。 */
interface BrowserTaskHeartbeat {
  /** 若续租已经失败则抛出原始错误。 */
  assertActive(): void;
  /** 停止续租并等待在途请求结束，返回此前的续租错误。 */
  stop(): Promise<unknown | undefined>;
}

/**
 * 根据服务端租约安排周期续租。
 *
 * 新版服务直接声明完整租约时长；兼容旧服务时优先使用领取快照中的
 * 剩余时间，无法计算才采用小于旧版最短租约的保守默认值。
 */
export function startBrowserTaskHeartbeat(
  claim: BrowserTaskClaim,
  renew: (signal: AbortSignal) => Promise<unknown>,
): BrowserTaskHeartbeat {
  const interval = heartbeatIntervalMilliseconds(claim);
  let stopped = false;
  let failure: unknown;
  let cancelWait: (() => void) | undefined;
  let renewalAbort: AbortController | undefined;

  const operation = (async () => {
    while (!stopped) {
      const elapsed = await waitForInterval(interval, (cancel) => {
        cancelWait = cancel;
      });
      cancelWait = undefined;
      if (!elapsed || stopped) return;
      renewalAbort = new AbortController();
      const timeout = setTimeout(() => renewalAbort?.abort(), interval);
      try {
        await renew(renewalAbort.signal);
      } catch (error) {
        if (stopped) return;
        failure = error;
        stopped = true;
      } finally {
        clearTimeout(timeout);
        renewalAbort = undefined;
      }
    }
  })();

  return {
    assertActive() {
      if (failure !== undefined) throw failure;
    },
    async stop() {
      stopped = true;
      cancelWait?.();
      renewalAbort?.abort();
      await operation;
      return failure;
    },
  };
}

/** 计算严格小于当前租约期限的续租间隔。 */
export function heartbeatIntervalMilliseconds(claim: BrowserTaskClaim): number {
  const declared = claim.lease_seconds;
  const remaining = remainingLeaseSeconds(claim.task.lease_expires_at);
  const leaseSeconds =
    typeof declared === "number" &&
    Number.isFinite(declared) &&
    declared >= MIN_DECLARED_LEASE_SECONDS
      ? declared
      : (remaining ?? DEFAULT_LEASE_SECONDS);
  return Math.max(1, Math.min(MAX_HEARTBEAT_INTERVAL_MS, (leaseSeconds * 1000) / 3));
}

function remainingLeaseSeconds(expiresAt: string | null): number | undefined {
  if (!expiresAt) return undefined;
  const remaining = (Date.parse(expiresAt) - Date.now()) / 1000;
  return Number.isFinite(remaining) && remaining >= MIN_DECLARED_LEASE_SECONDS
    ? remaining
    : undefined;
}

function waitForInterval(
  milliseconds: number,
  onCancel: (cancel: () => void) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(true);
    }, milliseconds);
    onCancel(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(false);
    });
  });
}
