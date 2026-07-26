import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BrowserExtensionStatus,
  BrowserTask,
} from "@xhs-downloader/contracts";

import {
  listBrowserExtensions,
  listBrowserTasks,
  retryBrowserTask,
  revokeBrowserExtension,
} from "./browser-management-api";

/** 浏览器扩展在线状态与最近任务审计数据。 */
export interface BrowserMonitorState {
  error: string;
  extensions: BrowserExtensionStatus[];
  onlineCount: number;
  refreshing: boolean;
  retryingTaskId: string | null;
  revokingExtensionId: string | null;
  tasks: BrowserTask[];
  refresh: () => Promise<void>;
  retry: (taskId: string) => Promise<void>;
  revoke: (extensionId: string) => Promise<void>;
}

/** 轮询浏览器心跳与任务历史，并管理显式重试。 */
export function useBrowserMonitor(): BrowserMonitorState {
  const [extensions, setExtensions] = useState<BrowserExtensionStatus[]>([]);
  const [tasks, setTasks] = useState<BrowserTask[]>([]);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);
  const [revokingExtensionId, setRevokingExtensionId] = useState<
    string | null
  >(null);
  const mounted = useRef(true);
  // 版本号阻止较慢的旧轮询覆盖用户刚刷新得到的新快照。
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    if (mounted.current) setRefreshing(true);
    try {
      const [nextExtensions, nextTasks] = await Promise.all([
        listBrowserExtensions(),
        listBrowserTasks(),
      ]);
      if (mounted.current && version === refreshVersion.current) {
        setExtensions(nextExtensions);
        setTasks(nextTasks);
        setError("");
      }
    } catch (reason) {
      if (mounted.current && version === refreshVersion.current) {
        setError(
          reason instanceof Error ? reason.message : "浏览器状态读取失败",
        );
      }
    } finally {
      if (mounted.current && version === refreshVersion.current) {
        setRefreshing(false);
      }
    }
  }, []);

  // 浏览器扩展每 30 秒发送一次领取请求；页面轮询只同步服务端心跳快照。
  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => {
      mounted.current = false;
      refreshVersion.current += 1;
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const retry = useCallback(async (taskId: string) => {
    if (mounted.current) setRetryingTaskId(taskId);
    try {
      const task = await retryBrowserTask(taskId);
      if (mounted.current) {
        setTasks((current) =>
          current.map((item) => (item.task_id === task.task_id ? task : item)),
        );
        setError("");
      }
    } catch (reason) {
      if (mounted.current) {
        setError(
          reason instanceof Error ? reason.message : "浏览器任务重试失败",
        );
      }
    } finally {
      if (mounted.current) setRetryingTaskId(null);
    }
  }, []);

  const revoke = useCallback(
    async (extensionId: string) => {
      if (mounted.current) setRevokingExtensionId(extensionId);
      try {
        await revokeBrowserExtension(extensionId);
        if (mounted.current) setError("");
        await refresh();
      } catch (reason) {
        if (mounted.current) {
          setError(
            reason instanceof Error ? reason.message : "扩展登记注销失败",
          );
        }
      } finally {
        if (mounted.current) setRevokingExtensionId(null);
      }
    },
    [refresh],
  );

  const onlineCount = useMemo(
    () => extensions.filter((item) => item.online).length,
    [extensions],
  );

  return {
    error,
    extensions,
    onlineCount,
    refreshing,
    retryingTaskId,
    revokingExtensionId,
    tasks,
    refresh,
    retry,
    revoke,
  };
}
