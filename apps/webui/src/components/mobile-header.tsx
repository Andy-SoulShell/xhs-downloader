import { ProductBrand } from "./product-brand";
import { StatusPill } from "./status-pill";

/**
 * 窄屏顶栏。
 *
 * 宽屏的品牌与服务状态都在侧栏里；侧栏在窄屏收起，这两项信息需要单独安置。
 *
 * @param props 组件属性。
 * @param props.online 本地服务连通状态；null 表示仍在探测。
 * @returns 仅在窄屏显示的品牌与状态栏。
 */
export function MobileHeader({ online }: { online: boolean | null }) {
  return (
    <header className="border-b border-stone-200/80 bg-[#f4f1eb]/90 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <ProductBrand compact />
        <StatusPill online={online} />
      </div>
    </header>
  );
}
