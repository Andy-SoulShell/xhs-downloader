import { Link2, Plus } from "lucide-react";
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
    <section aria-label="链接解析" className="control-shell p-3">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
        onSubmit={onSubmit}
      >
        <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl bg-stone-50 px-4 ring-1 ring-stone-200 transition focus-within:bg-white focus-within:ring-stone-400">
          <Link2
            aria-hidden
            className="shrink-0 text-stone-400"
            size={18}
          />
          <label className="min-w-0 flex-1" htmlFor="work-url">
            <span className="sr-only">帖子链接</span>
            <input
              aria-label="帖子链接"
              className="w-full bg-transparent text-sm text-stone-900 outline-none placeholder:text-stone-400"
              id="work-url"
              onChange={(event) => onChange(event.target.value)}
              placeholder="粘贴 xiaohongshu.com 或 xhslink.cn 链接"
              value={link}
            />
          </label>
        </div>
        <button
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-red-500 px-5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(239,68,68,0.18)] transition hover:bg-red-600 disabled:cursor-wait disabled:opacity-60"
          disabled={parsing}
          type="submit"
        >
          <Plus aria-hidden size={17} />
          {parsing ? "正在解析…" : "添加到列表"}
        </button>
      </form>
    </section>
  );
}
