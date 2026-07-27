import type { ReactNode } from "react";

interface PageHeadingProps {
  actions?: ReactNode;
  description?: string;
  meta: string;
  title: string;
}

/**
 * 工作台页头。
 *
 * 窄屏下标题与说明只保留在无障碍树中：顶部工作台导航已经显示当前工作台名称，
 * 再占一屏高度重复一遍会把真正的内容挤到首屏之外。
 *
 * @param props 组件属性。
 * @param props.title 工作台名称。
 * @param props.meta 标题旁的补充计数，没有时传空串。
 * @param props.description 一句话说明，可省略。
 * @param props.actions 页头右侧的操作区，窄屏下依然可见。
 * @returns 宽屏完整、窄屏收起文本的页头。
 */
export function PageHeading({ actions, description, meta, title }: PageHeadingProps) {
  return (
    <div
      className={`flex flex-col gap-4 md:mb-6 xl:flex-row xl:items-end xl:justify-between ${
        // 窄屏下标题被收进无障碍树；没有操作区时整块不可见，外边距也不该留下。
        actions ? "mb-4" : "mb-0 md:mb-6"
      }`}
    >
      <div className="max-md:sr-only">
        <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-3xl font-semibold tracking-[-0.035em] text-stone-950">
          <span>{title}</span>
          <span className="text-sm font-normal tracking-normal text-stone-600">{meta}</span>
        </h1>
        {description && <p className="mt-2 text-sm text-stone-600">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
