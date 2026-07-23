import type { FormEvent } from "react";

interface LinkComposerProps {
  link: string;
  parsing: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}

export function LinkComposer({
  link,
  parsing,
  onChange,
  onSubmit,
}: LinkComposerProps) {
  return (
    <section className="control-shell p-5 sm:p-6">
      <div className="mb-6">
        <p className="text-xs font-semibold tracking-[0.16em] text-red-500 uppercase">
          链接解析
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-950">
          添加帖子
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          每次添加一个链接，解析结果会保留在右侧列表中。
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <label
          className="text-xs font-semibold tracking-[0.12em] text-stone-500 uppercase"
          htmlFor="work-url"
        >
          帖子链接
        </label>
        <textarea
          className="mt-3 min-h-36 w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm leading-6 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500 focus:bg-white focus:ring-4 focus:ring-stone-100"
          id="work-url"
          onChange={(event) => onChange(event.target.value)}
          placeholder="粘贴 xiaohongshu.com 或 xhslink.cn 链接"
          value={link}
        />
        <button
          className="mt-4 w-full rounded-2xl bg-red-500 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(239,68,68,0.2)] transition hover:bg-red-600 disabled:cursor-wait disabled:opacity-60"
          disabled={parsing}
          type="submit"
        >
          {parsing ? "正在解析…" : "添加到列表"}
        </button>
      </form>

      <div className="mt-6 border-t border-stone-100 pt-5">
        <p className="text-xs leading-5 text-stone-400">
          Cookie、代理与保存目录由服务端 .env 管理，链接和结果只保留在当前页面。
        </p>
      </div>
    </section>
  );
}
