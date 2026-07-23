import type { DetailResponse } from "../lib/types";

interface ResultPanelProps {
  result: DetailResponse | null;
}

const formatTime = (value: string | null) => {
  if (!value) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

export function ResultPanel({ result }: ResultPanelProps) {
  if (!result?.data) {
    return (
      <section className="result-shell grid min-h-[540px] place-items-center p-8">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-6 grid size-20 place-items-center rounded-[28px] border border-stone-200 bg-white text-3xl shadow-sm">
            ↘
          </div>
          <p className="text-lg font-semibold text-stone-800">
            作品信息会在这里展开
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            粘贴链接后先解析详情，确认内容无误再下载到服务器本地。
          </p>
        </div>
      </section>
    );
  }

  const detail = result.data;
  return (
    <section className="result-shell overflow-hidden">
      <div className="border-b border-stone-200 p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white">
            {detail.作品类型}
          </span>
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
            {detail.媒体.length} 个媒体
          </span>
          {result.skipped && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              已复用本地产物
            </span>
          )}
        </div>
        <h2 className="text-2xl leading-tight font-semibold tracking-tight text-stone-950 sm:text-3xl">
          {detail.作品标题 || "未命名作品"}
        </h2>
        <p className="mt-4 line-clamp-3 text-sm leading-6 text-stone-600">
          {detail.作品描述 || "这个作品没有文字描述。"}
        </p>
      </div>

      <div className="grid gap-px bg-stone-200 sm:grid-cols-3">
        <Metric label="作者" value={detail.作者.作者昵称} />
        <Metric label="发布时间" value={formatTime(detail.发布时间)} />
        <Metric label="互动" value={`${detail.点赞数量} 赞`} />
      </div>

      <div className="p-6 sm:p-8">
        <p className="text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
          {result.files.length ? "下载产物" : "媒体清单"}
        </p>
        <div className="mt-4 space-y-3">
          {result.files.length
            ? result.files.map((file) => (
                <div
                  className="rounded-2xl border border-stone-200 bg-white p-4"
                  key={`${file.path}-${file.media_index}`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="min-w-0 truncate text-sm font-medium text-stone-800">
                      {file.path}
                    </p>
                    <span className="shrink-0 text-xs text-stone-500">
                      {formatBytes(file.size)}
                    </span>
                  </div>
                  <p className="mt-2 truncate font-mono text-[11px] text-stone-400">
                    SHA-256 {file.sha256}
                  </p>
                </div>
              ))
            : detail.媒体.map((item) => (
                <div
                  className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4"
                  key={`${item.类型}-${item.序号}`}
                >
                  <span className="text-sm font-medium text-stone-800">
                    {String(item.序号).padStart(2, "0")} · {item.类型}
                  </span>
                  <span className="text-xs uppercase text-stone-400">
                    {item.扩展名}
                  </span>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/80 px-6 py-4 sm:px-8">
      <p className="text-[11px] tracking-wider text-stone-400 uppercase">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-stone-800">{value}</p>
    </div>
  );
}
