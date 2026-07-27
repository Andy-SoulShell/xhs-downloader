import {
  formatNameFields,
  NAME_FIELDS,
  parseNameFormat,
  previewFileName,
  usesDefaultFields,
  type NameField,
} from "../lib/name-format";

interface NameFormatPickerProps {
  value: string;
  onChange: (value: string) => void;
}

/** 用勾选字段和实时预览代替手写命名格式。 */
export function NameFormatPicker({ value, onChange }: NameFormatPickerProps) {
  const selected = parseNameFormat(value);

  const toggle = (field: NameField) => {
    const next = selected.includes(field)
      ? selected.filter((item) => item !== field)
      : [...selected, field];
    onChange(formatNameFields(next));
  };

  return (
    <div className="min-w-0 sm:col-span-2">
      <p className="text-sm font-semibold text-stone-900">文件名包含</p>
      <p className="mt-1 text-xs leading-5 text-stone-600">
        点击选择要放进文件名的信息，按选中顺序排列。
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {NAME_FIELDS.map((field) => {
          const active = selected.includes(field);
          const order = selected.indexOf(field) + 1;
          return (
            <button
              aria-pressed={active}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
              }`}
              key={field}
              onClick={() => toggle(field)}
              type="button"
            >
              {active ? `${order}. ${field}` : field}
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl bg-stone-50 px-3 py-2">
        <p className="meta-text">
          示例效果{usesDefaultFields(selected) ? "（未选择时的默认组合）" : ""}
        </p>
        <p className="mt-1 truncate font-mono text-xs text-stone-700">
          {previewFileName(selected)}.jpg
        </p>
      </div>
    </div>
  );
}
