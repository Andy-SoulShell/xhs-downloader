import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

interface TagInputProps {
  /** 已确认的标签；不含 # 前缀。 */
  tags: string[];
  onChange: (tags: string[]) => void;
  /** 上限；达到后停止接受新标签并给出提示。 */
  limit?: number;
  placeholder?: string;
}

/**
 * 标签录入。
 *
 * 用可见的标签块代替空格分隔的长文本：用户能一眼看清已经加了哪些、
 * 单独删掉其中一个，而不必在一串文字里数空格。回车、逗号和空格都会
 * 确认当前输入，退格可删除最后一个。
 */
export function TagInput({
  tags,
  onChange,
  limit = 20,
  placeholder = "输入后回车",
}: TagInputProps) {
  const [draft, setDraft] = useState("");
  const full = tags.length >= limit;

  const commit = (value: string) => {
    const next = value.trim().replace(/^#+/, "");
    if (!next || full || tags.includes(next)) {
      setDraft("");
      return;
    }
    onChange([...tags, next]);
    setDraft("");
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === "," || event.key === "，") {
      event.preventDefault();
      commit(draft);
      return;
    }
    // 输入框为空时退格删除上一个标签，与常见标签控件一致。
    if (event.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="mt-2">
      <div className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-2 py-1.5 transition-all duration-200 focus-within:border-stone-400 focus-within:ring-4 focus-within:ring-stone-900/[0.06]">
        {tags.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-lg bg-stone-100 py-1 pr-1 pl-2 text-xs font-medium text-stone-700"
            key={tag}
          >
            #{tag}
            <button
              aria-label={`删除标签 ${tag}`}
              className="grid size-4 place-items-center rounded text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700"
              onClick={() => onChange(tags.filter((item) => item !== tag))}
              type="button"
            >
              <X aria-hidden size={11} />
            </button>
          </span>
        ))}
        <input
          aria-label="话题标签"
          className="min-w-24 flex-1 bg-transparent px-1 text-sm font-normal text-stone-900 outline-none placeholder:text-stone-400"
          disabled={full}
          onBlur={() => commit(draft)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKey}
          placeholder={full ? "" : tags.length ? "" : placeholder}
          value={draft}
        />
      </div>
      <p className="meta-text mt-1.5">
        {full ? `最多 ${limit} 个标签` : `已添加 ${tags.length}/${limit}`}
      </p>
    </div>
  );
}
