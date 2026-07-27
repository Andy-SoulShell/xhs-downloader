import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  listClientRecords,
  listTasks,
  retryTask,
  submitTask,
} from "./api";
import type {
  ClientDownloadRecord,
  DownloadTask,
  TaskRequest,
} from "./types";

export function useTaskCenter() {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [records, setRecords] = useState<ClientDownloadRecord[]>([]);
  const [error, setError] = useState("");
  // 首次读取未完成前不能显示"还没有记录"，否则会先闪一下空状态。
  const [loading, setLoading] = useState(true);

  const refreshTasks = useCallback(async () => {
    try {
      setTasks(await listTasks());
      setError("");
    } catch (reason) {
      setError(errorMessage(reason, "任务列表读取失败"));
    }
  }, []);

  const refreshRecords = useCallback(async () => {
    try {
      setRecords(await listClientRecords());
      setError("");
    } catch (reason) {
      setError(errorMessage(reason, "下载记录读取失败"));
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([listTasks(), listClientRecords()])
      .then(([nextTasks, nextRecords]) => {
        if (!active) return;
        setTasks(nextTasks);
        setRecords(nextRecords);
        setError("");
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason, "管理数据读取失败"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshRecords, refreshTasks]);

  const hasActiveTask = useMemo(
    () => tasks.some((task) => ["queued", "running"].includes(task.status)),
    [tasks],
  );
  useEffect(() => {
    if (!hasActiveTask) return;
    const timer = window.setInterval(() => void refreshTasks(), 1200);
    return () => window.clearInterval(timer);
  }, [hasActiveTask, refreshTasks]);

  const createTask = useCallback(async (request: TaskRequest) => {
    const task = await submitTask(request);
    setError("");
    setTasks((current) => [
      task,
      ...current.filter((item) => item.task_id !== task.task_id),
    ]);
    return task;
  }, []);

  const restartTask = useCallback(async (taskId: string) => {
    const task = await retryTask(taskId);
    setError("");
    setTasks((current) =>
      current.map((item) => (item.task_id === task.task_id ? task : item)),
    );
    return task;
  }, []);

  return {
    createTask,
    error,
    loading,
    records,
    refreshRecords,
    refreshTasks,
    restartTask,
    tasks,
  };
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}
