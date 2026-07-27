import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  cancelPublicationTask,
  createPublicationDraft,
  deletePublicationDraft,
  listPublicationDrafts,
  listPublicationTasks,
  removePublicationAsset,
  resumePublicationVerification,
  reviewPublicationTask,
  retryPublicationTask,
  submitPublicationTask,
  updatePublicationDraft,
  uploadPublicationAsset,
} from "./publication-api";
import type {
  PublicationDraft,
  PublicationDraftInput,
  PublicationMode,
  PublicationTask,
  PublicationVerificationResumeResult,
} from "./publication";

/** 统一管理发布草稿、任务轮询及需要用户确认的任务操作。 */
export function usePublicationCenter() {
  const [drafts, setDrafts] = useState<PublicationDraft[]>([]);
  const [tasks, setTasks] = useState<PublicationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshTasks = useCallback(async () => {
    try {
      setTasks(await listPublicationTasks());
      setError("");
    } catch (reason) {
      setError(errorMessage(reason, "发布任务读取失败"));
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([listPublicationDrafts(), listPublicationTasks()])
      .then(([nextDrafts, nextTasks]) => {
        if (!active) return;
        setDrafts(nextDrafts);
        setTasks(nextTasks);
        setError("");
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason, "发布中心读取失败"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const hasActiveTask = useMemo(
    () =>
      tasks.some((task) =>
        [
          "scheduled",
          "ready",
          "claimed",
          "filling",
          "publishing",
          "awaiting_verification",
        ].includes(task.status),
      ),
    [tasks],
  );
  useEffect(() => {
    if (!hasActiveTask) return;
    const timer = window.setInterval(() => void refreshTasks(), 1500);
    return () => window.clearInterval(timer);
  }, [hasActiveTask, refreshTasks]);

  const createDraft = useCallback(async () => {
    const draft = await createPublicationDraft();
    setDrafts((current) => [draft, ...current]);
    return draft;
  }, []);

  const saveDraft = useCallback(async (draftId: string, input: PublicationDraftInput) => {
    const draft = await updatePublicationDraft(draftId, input);
    replaceDraft(setDrafts, draft);
    return draft;
  }, []);

  const uploadAsset = useCallback(async (draftId: string, file: File) => {
    const draft = await uploadPublicationAsset(draftId, file);
    replaceDraft(setDrafts, draft);
    return draft;
  }, []);

  const removeAsset = useCallback(async (draftId: string, assetId: string) => {
    const draft = await removePublicationAsset(draftId, assetId);
    replaceDraft(setDrafts, draft);
    return draft;
  }, []);

  const deleteDraft = useCallback(async (draftId: string) => {
    await deletePublicationDraft(draftId);
    setDrafts((current) => current.filter((item) => item.draft_id !== draftId));
  }, []);

  const submitTask = useCallback(
    async (draftId: string, mode: PublicationMode, scheduledAt?: string) => {
      const task = await submitPublicationTask(draftId, mode, scheduledAt);
      replaceTask(setTasks, task);
      return task;
    },
    [],
  );

  const retryTask = useCallback(async (taskId: string) => {
    const task = await retryPublicationTask(taskId);
    replaceTask(setTasks, task);
    return task;
  }, []);

  const resumeVerification = useCallback(
    async (taskId: string): Promise<PublicationVerificationResumeResult> => {
      const result = await resumePublicationVerification(taskId);
      setTasks((current) =>
        current.map((task) =>
          task.task_id === result.task_id ? { ...task, message: result.message } : task,
        ),
      );
      return result;
    },
    [],
  );

  const reviewTask = useCallback(async (taskId: string, published: boolean) => {
    const task = await reviewPublicationTask(taskId, published);
    replaceTask(setTasks, task);
    return task;
  }, []);

  const cancelTask = useCallback(async (taskId: string) => {
    const task = await cancelPublicationTask(taskId);
    replaceTask(setTasks, task);
    return task;
  }, []);

  return {
    cancelTask,
    createDraft,
    deleteDraft,
    drafts,
    error,
    loading,
    refreshTasks,
    removeAsset,
    resumeVerification,
    reviewTask,
    retryTask,
    saveDraft,
    submitTask,
    tasks,
    uploadAsset,
  };
}

function replaceDraft(
  update: Dispatch<SetStateAction<PublicationDraft[]>>,
  draft: PublicationDraft,
): void {
  update((current) => current.map((item) => (item.draft_id === draft.draft_id ? draft : item)));
}

function replaceTask(
  update: Dispatch<SetStateAction<PublicationTask[]>>,
  task: PublicationTask,
): void {
  update((current) => [task, ...current.filter((item) => item.task_id !== task.task_id)]);
}

function errorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}
