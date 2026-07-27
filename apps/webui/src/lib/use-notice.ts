import { useCallback, useState } from "react";

import type { NoticeTone } from "../components/app-toast";

interface Notice {
  message: string;
  tone: NoticeTone;
}

interface NoticeCenter {
  notice: Notice;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** 展示一条提示；不传语气时按中性处理。 */
  notify: (message: string, tone?: NoticeTone) => void;
}

/**
 * 全局提示的状态与展示入口。
 *
 * @returns 当前提示内容、展示状态与展示回调。
 */
export function useNotice(): NoticeCenter {
  const [notice, setNotice] = useState<Notice>({ message: "", tone: "info" });
  const [open, setOpen] = useState(false);

  const notify = useCallback((message: string, tone: NoticeTone = "info") => {
    setNotice({ message, tone });
    setOpen(true);
  }, []);

  return { notice, open, setOpen, notify };
}
