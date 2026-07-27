interface BrowseEmptyStateOptions {
  /** 是否正在取内容。 */
  busy: boolean;
  /** 上一次取内容的失败原因；空串表示没失败。 */
  error: string;
  /** 是否已经成功取过一次内容。 */
  fetched: boolean;
}

interface BrowseEmptyState {
  title: string;
  description: string;
}

/**
 * 计算浏览结果为空时该说什么。
 *
 * 这里必须跟着上一次动作走。此前不论是刚失败、还是搜了没结果，都一律显示
 * “还没有内容 / 点上面的「看看推荐」”，等于让人把刚失败的那一步再做一遍，
 * 而真正的失败原因只是角落里一行小字。
 *
 * @param options 当前的取内容状态。
 * @returns 空状态的标题与说明。
 */
export function browseEmptyState({
  busy,
  error,
  fetched,
}: BrowseEmptyStateOptions): BrowseEmptyState {
  if (busy) {
    return {
      title: "正在打开小红书",
      description: "第一次打开要等浏览器启动，稍等一下。",
    };
  }
  if (error) {
    return {
      // 错误本身通常已经带了下一步，不要再缀一句“再试一次”凑成两遍。
      title: "没能取到内容",
      description: error.endsWith("。") ? error : `${error}。`,
    };
  }
  if (fetched) {
    return {
      title: "没有找到相关内容",
      description: "换个说法再搜一次，或者点「看看推荐」看看首页。",
    };
  }
  return {
    title: "还没有内容",
    description: "搜索你想找的内容，或者点「看看推荐」看看首页。",
  };
}
