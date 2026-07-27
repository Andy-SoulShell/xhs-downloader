import { useEffect, useRef } from "react";

import type { NoticeTone } from "../components/app-toast";
import { describeSettled, detectSettledTasks } from "./task-transitions";
import type { DownloadTask } from "./types";

/**
 * 在下载落定时给出一次提示。
 *
 * 用户点完下载只会收到"已开始"，此后无论成败都没有下文，只能自己切到动态页
 * 反复查看。这里对轮询结果做跃迁检测，在结果出来的那一刻主动告知。
 *
 * @param tasks 当前轮询到的任务列表。
 * @param notify 展示提示的回调。
 */
export function useDownloadCompletion(
  tasks: DownloadTask[],
  notify: (message: string, tone?: NoticeTone) => void,
): void {
  // 用 ref 保存上一轮快照：放进依赖会让效应在自身触发的重渲染里再跑一次。
  const previous = useRef<DownloadTask[]>([]);
  // notify 每次渲染都是新函数；存进 ref 才能既拿到最新实现又不把它变成依赖。
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  useEffect(() => {
    const settled = detectSettledTasks(previous.current, tasks);
    previous.current = tasks;
    const notice = describeSettled(settled);
    if (notice) notifyRef.current(notice.message, notice.tone);
  }, [tasks]);
}
