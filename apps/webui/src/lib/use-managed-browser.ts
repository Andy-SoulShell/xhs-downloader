import { useCallback, useEffect, useRef, useState } from "react";

import {
  getManagedBrowserStatus,
  startManagedBrowser,
  stopManagedBrowser,
  type ManagedBrowserStatus,
} from "./managed-browser-api";

/** 软件自带浏览器控制区可观察的状态和操作。 */
export interface ManagedBrowserControl {
  error: string;
  loading: boolean;
  operation: "start" | "stop" | null;
  refreshing: boolean;
  status: ManagedBrowserStatus | null;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/** 同步软件自带的 Chromium 生命周期并阻止重入操作。 */
export function useManagedBrowser(): ManagedBrowserControl {
  const [status, setStatus] = useState<ManagedBrowserStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [operation, setOperation] = useState<"start" | "stop" | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);

  const run = useCallback(
    async (
      nextOperation: "start" | "stop" | null,
      request: () => Promise<ManagedBrowserStatus>,
    ) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (mounted.current) {
        if (nextOperation) setOperation(nextOperation);
        else setRefreshing(true);
      }
      try {
        const next = await request();
        if (mounted.current) {
          setStatus(next);
          setError("");
        }
      } catch (reason) {
        if (mounted.current) {
          setError(reason instanceof Error ? reason.message : "软件自带浏览器操作失败");
        }
      } finally {
        inFlight.current = false;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
          setOperation(null);
        }
      }
    },
    [],
  );

  const refresh = useCallback(() => run(null, () => getManagedBrowserStatus()), [run]);
  const start = useCallback(() => run("start", startManagedBrowser), [run]);
  const stop = useCallback(() => run("stop", stopManagedBrowser), [run]);

  // 软件自带进程可能从服务外退出；定时同步服务端生命周期，避免页面保留陈旧运行态。
  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      mounted.current = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  return {
    error,
    loading,
    operation,
    refreshing,
    status,
    refresh,
    start,
    stop,
  };
}
