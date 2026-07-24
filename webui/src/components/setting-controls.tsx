import { useId } from "react";
import type { ReactNode } from "react";
import { Switch } from "radix-ui";

import { ActionButton } from "./action-button";
import { Badge } from "./badge";

export function SettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-semibold text-stone-900">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-stone-500">{description}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

interface FieldShellProps {
  children: ReactNode;
  help: string;
  id: string;
  label: string;
  wide?: boolean;
}

function FieldShell({
  children,
  help,
  id,
  label,
  wide = false,
}: FieldShellProps) {
  return (
    <label className={wide ? "sm:col-span-2" : ""} htmlFor={id}>
      <span className="text-xs font-semibold text-stone-700">{label}</span>
      {children}
      <span className="mt-1.5 block text-[11px] leading-4 text-stone-400">
        {help}
      </span>
    </label>
  );
}

const fieldClass =
  "mt-2 h-11 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:bg-white focus:ring-4 focus:ring-stone-100";

export function TextSetting({
  help,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
  wide,
}: {
  help: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "password" | "text";
  value: string;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <FieldShell help={help} id={id} label={label} wide={wide}>
      <input
        aria-label={label}
        autoComplete={type === "password" ? "new-password" : "off"}
        className={fieldClass}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </FieldShell>
  );
}

export function SensitiveSetting({
  clear,
  configured,
  help,
  label,
  onChange,
  onClearChange,
  placeholder,
  value,
}: {
  clear: boolean;
  configured: boolean;
  help: string;
  label: string;
  onChange: (value: string) => void;
  onClearChange: (clear: boolean) => void;
  placeholder: string;
  value: string;
}) {
  const id = useId();
  const active = configured && !clear;
  return (
    <FieldShell help={help} id={id} label={label}>
      <input
        aria-label={label}
        autoComplete="new-password"
        className={fieldClass}
        id={id}
        onChange={(event) => {
          onClearChange(false);
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        type="password"
        value={value}
      />
      <span className="mt-2 flex items-center justify-between gap-2">
        <Badge tone={clear ? "danger" : active ? "success" : "neutral"}>
          {clear ? "保存时清除" : active ? "已配置" : "未配置"}
        </Badge>
        {configured && (
          <ActionButton
            className="h-7 px-2 text-[11px]"
            onClick={() => onClearChange(!clear)}
            variant="ghost"
          >
            {clear ? "保留原值" : "清除"}
          </ActionButton>
        )}
      </span>
    </FieldShell>
  );
}

export function NumberSetting({
  help,
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
}: {
  help: string;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number | "any";
  value: number;
}) {
  const id = useId();
  return (
    <FieldShell help={help} id={id} label={label}>
      <input
        aria-label={label}
        className={fieldClass}
        id={id}
        max={max}
        min={min}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) onChange(next);
        }}
        step={step}
        type="number"
        value={value}
      />
    </FieldShell>
  );
}

export function SelectSetting({
  help,
  label,
  onChange,
  options,
  value,
}: {
  help: string;
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  const id = useId();
  return (
    <FieldShell help={help} id={id} label={label}>
      <select
        aria-label={label}
        className={fieldClass}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function TextAreaSetting({
  help,
  label,
  onChange,
  value,
}: {
  help: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = useId();
  return (
    <FieldShell help={help} id={id} label={label} wide>
      <textarea
        aria-label={label}
        className={`${fieldClass} h-28 resize-y py-3 font-mono text-xs`}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        value={value}
      />
    </FieldShell>
  );
}

export function ToggleSetting({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <span>
        <span className="block text-xs font-semibold text-stone-700">
          {label}
        </span>
        <span className="mt-1 block text-[11px] leading-4 text-stone-400">
          {description}
        </span>
      </span>
      <Switch.Root
        aria-label={label}
        checked={checked}
        className="relative h-5 w-9 shrink-0 rounded-full bg-stone-200 outline-none data-[state=checked]:bg-red-500 focus:ring-4 focus:ring-red-100"
        onCheckedChange={onChange}
      >
        <Switch.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </label>
  );
}
