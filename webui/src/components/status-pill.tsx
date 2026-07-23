import { Tooltip } from "radix-ui";

interface StatusPillProps {
  online: boolean | null;
}

export function StatusPill({ online }: StatusPillProps) {
  const label =
    online === null ? "正在连接" : online ? "服务已连接" : "服务未连接";

  return (
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <div
            className="inline-flex cursor-default items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm backdrop-blur"
            role="status"
          >
            <span
              className={`size-2 rounded-full ${
                online === null
                  ? "animate-pulse bg-amber-400"
                  : online
                    ? "bg-emerald-500"
                    : "bg-red-500"
              }`}
            />
            {label}
          </div>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="rounded-lg bg-stone-900 px-3 py-2 text-xs text-white shadow-xl"
            sideOffset={8}
          >
            {online
              ? "FastAPI 服务运行正常"
              : "请先运行 uv run xhs-downloader api"}
            <Tooltip.Arrow className="fill-stone-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
