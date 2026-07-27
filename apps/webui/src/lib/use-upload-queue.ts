import { useCallback, useRef, useState } from "react";

import { describeError } from "./error-message";

/** 队列里一个文件的当前处境。 */
export type UploadItemState = "pending" | "uploading" | "done" | "failed";

export interface UploadItem {
  id: string;
  filename: string;
  size: number;
  state: UploadItemState;
  /** 失败原因，面向用户。 */
  message?: string;
}

export interface UploadQueue {
  items: UploadItem[];
  /** 队列里还有没传完的。 */
  busy: boolean;
  enqueue: (files: File[]) => void;
  retry: (id: string) => void;
  /** 移出一条已经结束的记录。 */
  dismiss: (id: string) => void;
  /** 清掉全部已经传好的记录。 */
  clearFinished: () => void;
}

/**
 * 逐个上传素材并逐个汇报结果。
 *
 * 此前是一个裸的 for-await：整批文件排队发出去，全程唯一的反馈是表单被
 * 禁用，哪一个失败了、还剩几个都看不出来，一个失败还会把后面的一起带走。
 *
 * @param upload 上传单个文件；抛错即视为这一条失败，队列继续往下走。
 * @returns 队列状态与入队、重试、清理操作。
 */
export function useUploadQueue(upload: (file: File) => Promise<void>): UploadQueue {
  const [items, setItems] = useState<UploadItem[]>([]);
  // 待传的 id 与文件本体要在异步循环里读写，state 快照在循环中永远是旧的。
  const pending = useRef<string[]>([]);
  // 连同选中那一刻的上传实现一起记下：文件属于当时那份草稿，
  // 传到一半换了草稿也不该改投到新的那份去。
  const files = useRef(new Map<string, { file: File; upload: (file: File) => Promise<void> }>());
  const running = useRef(false);
  const nextId = useRef(0);

  const patch = useCallback((id: string, change: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (let id = pending.current.shift(); id; id = pending.current.shift()) {
        const entry = files.current.get(id);
        if (!entry) continue;
        patch(id, { state: "uploading", message: undefined });
        try {
          await entry.upload(entry.file);
          patch(id, { state: "done" });
        } catch (error) {
          patch(id, { state: "failed", message: describeError(error, "上传失败") });
        }
      }
    } finally {
      running.current = false;
    }
  }, [patch]);

  const enqueue = useCallback(
    (selected: File[]) => {
      if (!selected.length) return;
      const added = selected.map((file) => ({ id: `upload-${nextId.current++}`, file }));
      for (const { id, file } of added) files.current.set(id, { file, upload });
      pending.current.push(...added.map(({ id }) => id));
      setItems((current) => [
        ...current,
        ...added.map(({ id, file }) => ({
          id,
          filename: file.name,
          size: file.size,
          state: "pending" as const,
        })),
      ]);
      void pump();
    },
    [pump, upload],
  );

  const retry = useCallback(
    (id: string) => {
      if (!files.current.has(id)) return;
      pending.current.push(id);
      patch(id, { state: "pending", message: undefined });
      void pump();
    },
    [patch, pump],
  );

  const forget = useCallback((keep: (item: UploadItem) => boolean) => {
    setItems((current) => {
      for (const item of current) if (!keep(item)) files.current.delete(item.id);
      return current.filter(keep);
    });
  }, []);

  const dismiss = useCallback(
    (id: string) => forget((item) => item.id !== id || item.state === "uploading"),
    [forget],
  );
  const clearFinished = useCallback(() => forget((item) => item.state !== "done"), [forget]);

  return {
    items,
    busy: items.some((item) => item.state === "pending" || item.state === "uploading"),
    enqueue,
    retry,
    dismiss,
    clearFinished,
  };
}
