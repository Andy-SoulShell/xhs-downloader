/** 一条作者名称映射;`id` 仅用于在编辑期间稳定标识行。 */
export interface AuthorMappingRow {
  id: string;
  authorId: string;
  displayName: string;
}

/** 把服务端映射对象展开为可编辑的行。 */
export function toMappingRows(
  mapping: Record<string, string>,
): AuthorMappingRow[] {
  return Object.entries(mapping).map(([authorId, displayName], index) => ({
    id: `${index}-${authorId}`,
    authorId,
    displayName,
  }));
}

/**
 * 把编辑行收敛回服务端映射对象。
 *
 * 两端留白与空行都会被忽略，因此用户新增一行后即使暂时留空也不会
 * 影响保存；同一作者重复出现时以最后一行为准。
 *
 * @param rows 当前编辑中的映射行。
 * @returns 可直接提交的作者映射对象。
 */
export function toMappingObject(
  rows: AuthorMappingRow[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const row of rows) {
    const authorId = row.authorId.trim();
    const displayName = row.displayName.trim();
    if (!authorId || !displayName) continue;
    mapping[authorId] = displayName;
  }
  return mapping;
}

/** 找出填了一半的行，供界面就地提示而不是阻断保存。 */
export function incompleteMappingRows(
  rows: AuthorMappingRow[],
): AuthorMappingRow[] {
  return rows.filter((row) => {
    const hasId = Boolean(row.authorId.trim());
    const hasName = Boolean(row.displayName.trim());
    return hasId !== hasName;
  });
}
