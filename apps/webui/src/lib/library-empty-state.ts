interface LibraryEmptyStateOptions {
  /** 本地服务连通状态；null 表示仍在探测。 */
  online: boolean | null;
  /** 已加载的帖子总数，与当前筛选无关。 */
  totalPosts: number;
}

interface LibraryEmptyState {
  title: string;
  description: string;
  /** 为真时应额外提供重试入口。 */
  offline: boolean;
}

/**
 * 计算帖子列表为空时该说什么。
 *
 * 服务不可达和“还没添加过帖子”在界面上是同一副样子，但用户该做的事完全相反：
 * 前者再怎么粘贴链接也不会成功。两者必须区分。
 *
 * @param options 连通状态与帖子总数。
 * @returns 空状态的标题、说明，以及是否需要重试入口。
 */
export function libraryEmptyState({
  online,
  totalPosts,
}: LibraryEmptyStateOptions): LibraryEmptyState {
  if (online === false && totalPosts === 0) {
    return {
      title: "连接不上本地服务",
      description:
        "帖子和下载记录都保存在本地服务里。请确认它还在运行，然后重试。",
      offline: true,
    };
  }
  if (totalPosts > 0) {
    return {
      title: "没有符合条件的帖子",
      description: "换一个关键词或筛选条件试试。",
      offline: false,
    };
  }
  return {
    title: "帖子列表还是空的",
    description:
      "在上方粘贴 xiaohongshu.com 或 xhslink.cn 链接，解析完成后帖子会出现在这里。",
    offline: false,
  };
}
