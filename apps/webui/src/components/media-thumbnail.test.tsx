import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MediaThumbnail } from "./media-thumbnail";

const FALLBACK = <span data-testid="fallback">占位</span>;

describe("列表封面缩略图", () => {
  it("没有封面时直接交给备用内容", () => {
    render(<MediaThumbnail alt="封面" fallback={FALLBACK} src={null} />);

    expect(screen.getByTestId("fallback")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("加载完成前保持透明，完成后淡入", () => {
    render(
      <MediaThumbnail alt="合成封面" fallback={FALLBACK} src="https://example.invalid/cover.jpg" />,
    );

    const image = screen.getByRole("img", { name: "合成封面" });
    expect(image.className).toContain("opacity-0");

    fireEvent.load(image);
    expect(image.className).toContain("opacity-100");
  });

  it("加载失败时给出明确占位而不是破图", () => {
    render(
      <MediaThumbnail
        alt="合成封面"
        fallback={FALLBACK}
        src="https://example.invalid/expired.jpg"
      />,
    );

    fireEvent.error(screen.getByRole("img", { name: "合成封面" }));

    // 媒体地址带签名会过期，破图比没有图更糟。
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTitle("封面加载失败")).toBeInTheDocument();
  });

  it("缓存里直接读完的图也要显示出来", () => {
    // 本机素材这类小图常常在 React 挂上 onLoad 之前就读完了，
    // 只等 load 事件的话它会一直停在透明的加载态。
    Object.defineProperty(HTMLImageElement.prototype, "complete", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(HTMLImageElement.prototype, "naturalWidth", {
      configurable: true,
      get: () => 800,
    });
    try {
      render(<MediaThumbnail alt="合成封面" fallback={FALLBACK} src="/publication/asset" />);

      expect(screen.getByRole("img", { name: "合成封面" }).className).toContain("opacity-100");
    } finally {
      Reflect.deleteProperty(HTMLImageElement.prototype, "complete");
      Reflect.deleteProperty(HTMLImageElement.prototype, "naturalWidth");
    }
  });

  it("不在 flex 容器里也保持固定尺寸", () => {
    // span 默认是 inline，宽高会被忽略，里面 size-full 的图片按原始尺寸铺开。
    render(<MediaThumbnail alt="合成封面" fallback={FALLBACK} src="/publication/asset" />);

    const wrapper = screen.getByRole("img", { name: "合成封面" }).parentElement;
    expect(wrapper?.className).toContain("inline-block");
    expect(wrapper?.className).toContain("size-14");
  });

  it("不向第三方发送来源信息", () => {
    render(
      <MediaThumbnail alt="合成封面" fallback={FALLBACK} src="https://example.invalid/cover.jpg" />,
    );

    expect(screen.getByRole("img")).toHaveAttribute("referrerpolicy", "no-referrer");
  });
});
