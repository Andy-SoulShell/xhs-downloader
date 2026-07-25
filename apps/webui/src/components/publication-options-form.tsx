import type { PublicationVisibility } from "../lib/publication";

interface PublicationOptionsFormProps {
  hasVideo: boolean;
  isOriginal: boolean;
  onOriginalChange: (value: boolean) => void;
  onProductsChange: (value: string) => void;
  onVisibilityChange: (value: PublicationVisibility) => void;
  products: string;
  visibility: PublicationVisibility;
}

/** 编辑可见范围、原创声明和待确认商品。 */
export function PublicationOptionsForm({
  hasVideo,
  isOriginal,
  onOriginalChange,
  onProductsChange,
  onVisibilityChange,
  products,
  visibility,
}: PublicationOptionsFormProps) {
  return (
    <fieldset className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
      <legend className="px-1 text-xs font-semibold text-stone-700">
        发布选项
      </legend>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-xs font-semibold text-stone-700">
          可见范围
          <select
            className="mt-2 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm font-normal text-stone-900 outline-none focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
            onChange={(event) =>
              onVisibilityChange(event.target.value as PublicationVisibility)
            }
            value={visibility}
          >
            <option value="public">公开可见</option>
            <option value="private">仅自己可见</option>
            <option value="mutual">仅互关好友可见</option>
          </select>
        </label>
        <label className="flex min-w-0 items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700">
          <input
            checked={!hasVideo && isOriginal}
            className="size-4 accent-stone-900"
            disabled={hasVideo}
            onChange={(event) => onOriginalChange(event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="block font-semibold">声明原创</span>
            <span className="mt-0.5 block text-[11px] text-stone-500">
              {hasVideo ? "当前仅支持图文笔记" : "发布前会核验官方开关"}
            </span>
          </span>
        </label>
      </div>
      <label className="mt-4 block text-xs font-semibold text-stone-700">
        绑定商品
        <textarea
          className="mt-2 min-h-20 w-full resize-y rounded-xl border border-stone-200 bg-white p-3 text-sm font-normal text-stone-900 outline-none focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
          onChange={(event) => onProductsChange(event.target.value)}
          placeholder="每行一个商品名称或商品 ID；发布前会再次确认"
          value={products}
        />
      </label>
      <p className="mt-2 text-[11px] leading-5 text-stone-500">
        商品搜索只有一个明确匹配时才会绑定；零个或多个匹配都会中止发布。
      </p>
    </fieldset>
  );
}
