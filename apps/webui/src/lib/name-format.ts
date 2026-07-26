/** 文件命名可用的字段;顺序与服务端 `SUPPORTED_FIELDS` 一致。 */
export const NAME_FIELDS = [
  "发布时间",
  "作者昵称",
  "作者ID",
  "作品标题",
  "作品ID",
  "作品类型",
] as const;

/** 服务端支持的命名字段。 */
export type NameField = (typeof NAME_FIELDS)[number];

/** 生成预览时使用的示例值，明确标注为示例避免误认为真实作品。 */
const SAMPLE: Record<NameField, string> = {
  发布时间: "2026-07-26",
  作者昵称: "示例作者",
  作者ID: "示例作者ID",
  作品标题: "示例标题",
  作品ID: "示例作品ID",
  作品类型: "图文",
};

/**
 * 解析命名格式为字段列表。
 *
 * 服务端按空格分隔并忽略无法识别的字段，这里保持一致，使界面显示的
 * 选中状态与实际生效的命名一致。
 *
 * @param format 以空格分隔的命名格式。
 * @returns 按出现顺序去重后的受支持字段。
 */
export function parseNameFormat(format: string): NameField[] {
  const known = new Set<string>(NAME_FIELDS);
  const fields: NameField[] = [];
  for (const token of format.split(/\s+/)) {
    if (known.has(token) && !fields.includes(token as NameField)) {
      fields.push(token as NameField);
    }
  }
  return fields;
}

/** 把字段列表还原为服务端使用的格式字符串。 */
export function formatNameFields(fields: NameField[]): string {
  return fields.join(" ");
}

/**
 * 生成文件名预览。
 *
 * 服务端用下划线连接各字段值；没有选择任何字段时会回退到默认组合，
 * 预览同样反映这一行为，避免用户以为清空后文件会没有名字。
 *
 * @param fields 当前选中的字段。
 * @returns 不含扩展名的示例文件名。
 */
export function previewFileName(fields: NameField[]): string {
  const effective = fields.length
    ? fields
    : (["发布时间", "作者昵称", "作品标题"] as NameField[]);
  return effective.map((field) => SAMPLE[field]).join("_");
}

/** 未选择任何字段时服务端会回退到默认组合。 */
export function usesDefaultFields(fields: NameField[]): boolean {
  return fields.length === 0;
}
