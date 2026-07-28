import { CheckCircle2, CircleAlert, RotateCcw, X } from "lucide-react";

import type { UploadQueue } from "../../lib/use-upload-queue";
import { ActionButton } from "../action-button";
import { Badge } from "../badge";

/**
 * 上传中的文件队列。
 *
 * 逐个显示排队、上传中、已添加或失败，失败的单独重试。此前整批文件一起
 * 发出去，唯一的反馈是表单变灰，传到第几个、哪个失败了都无从得知。
 *
 * @param props 组件属性。
 * @param props.queue 上传队列状态与操作。
 * @returns 队列为空时不渲染任何东西。
 */
export function PublicationUploadQueue({ queue }: { queue: UploadQueue }) {
  if (!queue.items.length) return null;
  const done = queue.items.filter((item) => item.state === "done").length;
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-xs font-semibold text-stone-700">
          {queue.busy ? `正在添加素材，已完成 ${done}/${queue.items.length}` : "素材添加完成"}
        </p>
        {done > 0 && !queue.busy && (
          <ActionButton onClick={queue.clearFinished} variant="ghost">
            收起
          </ActionButton>
        )}
      </div>
      <ul className="mt-2 space-y-1.5">
        {queue.items.map((item) => (
          <li
            className="flex min-w-0 items-center gap-2 rounded-xl bg-white px-3 py-2"
            key={item.id}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-stone-800">{item.filename}</span>
              {item.message && (
                <span className="mt-0.5 block text-[11px] leading-4 text-red-600">
                  {item.message}
                </span>
              )}
            </span>
            {item.state === "done" ? (
              <Badge icon={CheckCircle2} tone="success">
                已添加
              </Badge>
            ) : item.state === "failed" ? (
              <>
                <Badge icon={CircleAlert} tone="danger">
                  未添加
                </Badge>
                <ActionButton
                  aria-label={`重新添加 ${item.filename}`}
                  onClick={() => queue.retry(item.id)}
                  size="icon"
                  variant="ghost"
                >
                  <RotateCcw aria-hidden size={13} />
                </ActionButton>
                <ActionButton
                  aria-label={`不再添加 ${item.filename}`}
                  onClick={() => queue.dismiss(item.id)}
                  size="icon"
                  variant="ghost"
                >
                  <X aria-hidden size={13} />
                </ActionButton>
              </>
            ) : (
              <Badge spinning={item.state === "uploading"} tone="neutral">
                {item.state === "uploading" ? "正在添加" : "排队中"}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
