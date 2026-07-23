import { Checkbox } from "radix-ui";

import type { MediaResource } from "../lib/types";

interface MediaPickerProps {
  media: MediaResource[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}

export function MediaPicker({
  media,
  selected,
  onChange,
}: MediaPickerProps) {
  if (media.length === 0) return null;

  const toggle = (index: number, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(index);
    else next.delete(index);
    onChange(next);
  };

  return (
    <fieldset className="mt-5 border-t border-stone-200 pt-5">
      <legend className="mb-3 text-xs font-semibold tracking-[0.14em] text-stone-500 uppercase">
        指定媒体
      </legend>
      <div className="flex flex-wrap gap-2">
        {media.map((item) => (
          <label
            className="group flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm transition hover:border-stone-400"
            key={`${item.类型}-${item.序号}`}
          >
            <Checkbox.Root
              checked={selected.has(item.序号)}
              className="grid size-4 place-items-center rounded border border-stone-400 bg-white data-[state=checked]:border-red-500 data-[state=checked]:bg-red-500"
              onCheckedChange={(checked) => toggle(item.序号, checked === true)}
            >
              <Checkbox.Indicator className="text-[10px] font-bold text-white">
                ✓
              </Checkbox.Indicator>
            </Checkbox.Root>
            <span>{item.序号}</span>
            <span className="text-xs text-stone-400">{item.类型}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-stone-400">
        不选择时下载当前配置允许的全部媒体
      </p>
    </fieldset>
  );
}
