import { Plus, Trash2 } from "lucide-react";

import type { AuthorMappingRow } from "../lib/author-mapping";
import { incompleteMappingRows } from "../lib/author-mapping";
import { ActionButton } from "./action-button";

interface AuthorMappingEditorProps {
  rows: AuthorMappingRow[];
  onChange: (rows: AuthorMappingRow[]) => void;
}

/** 以键值行编辑作者名称映射，避免让用户手写 JSON。 */
export function AuthorMappingEditor({ rows, onChange }: AuthorMappingEditorProps) {
  const incomplete = incompleteMappingRows(rows);

  const update = (id: string, change: Partial<AuthorMappingRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...change } : row)));

  return (
    <div className="min-w-0 sm:col-span-2">
      <p className="text-sm font-semibold text-stone-900">作者名称替换</p>
      <p className="mt-1 text-xs leading-5 text-stone-600">
        把某个作者的目录名换成你自己的叫法；不填就用原昵称。
      </p>

      {rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li className="flex min-w-0 items-center gap-2" key={row.id}>
              <input
                aria-label="作者 ID"
                className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-4 focus:ring-red-100"
                onChange={(event) => update(row.id, { authorId: event.target.value })}
                placeholder="作者 ID"
                value={row.authorId}
              />
              <span className="shrink-0 text-xs text-stone-400">显示为</span>
              <input
                aria-label="显示名称"
                className="min-w-0 flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-red-300 focus:ring-4 focus:ring-red-100"
                onChange={(event) => update(row.id, { displayName: event.target.value })}
                placeholder="显示名称"
                value={row.displayName}
              />
              <ActionButton
                aria-label={`删除 ${row.authorId || "这一条"}`}
                onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
                size="icon"
                variant="ghost"
              >
                <Trash2 aria-hidden size={15} />
              </ActionButton>
            </li>
          ))}
        </ul>
      )}

      {incomplete.length > 0 && (
        <p className="mt-2 text-xs leading-5 text-amber-700">
          有 {incomplete.length} 条只填了一半，保存时会忽略这些行。
        </p>
      )}

      <ActionButton
        className="mt-3"
        onClick={() =>
          onChange([
            ...rows,
            {
              id: `new-${rows.length}-${crypto.randomUUID()}`,
              authorId: "",
              displayName: "",
            },
          ])
        }
        variant="outline"
      >
        <Plus aria-hidden size={14} />
        添加一条
      </ActionButton>
    </div>
  );
}
