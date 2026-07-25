/** 表示页面可能已经产生写入，但扩展无法确认最终结果。 */
export class UncertainBrowserActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UncertainBrowserActionError";
  }
}
