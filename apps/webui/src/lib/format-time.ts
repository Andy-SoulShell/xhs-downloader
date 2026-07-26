const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * 把时间戳格式化为便于扫读的相对时间。
 *
 * 任务列表里用户关心的是"多久之前"，完整日期既占地方又需要心算；
 * 超过一周后相对时间失去意义，改回日期。
 *
 * @param value ISO 时间字符串。
 * @param now 当前时间；便于测试注入。
 * @returns 例如"刚刚""12 分钟前""昨天 20:37""7月19日"。
 */
export function formatRelativeTime(value: string, now = new Date()): string {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "";
  const elapsed = now.getTime() - target.getTime();

  if (elapsed < 0) return formatClock(target);
  if (elapsed < MINUTE) return "刚刚";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} 分钟前`;
  if (elapsed < DAY && isSameDay(target, now)) {
    return `${Math.floor(elapsed / HOUR)} 小时前`;
  }
  if (elapsed < 2 * DAY && isYesterday(target, now)) {
    return `昨天 ${formatClock(target)}`;
  }
  if (elapsed < 7 * DAY) {
    return `${Math.floor(elapsed / DAY)} 天前`;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(target);
}

/**
 * 完整时间，用于需要精确到分钟的场合。
 *
 * @param value ISO 时间字符串。
 * @returns 例如"2026年7月26日 20:37"。
 */
export function formatFullTime(value: string): string {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(target);
}

function formatClock(target: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(target);
}

function isSameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}

function isYesterday(target: Date, now: Date): boolean {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  return isSameDay(target, yesterday);
}
