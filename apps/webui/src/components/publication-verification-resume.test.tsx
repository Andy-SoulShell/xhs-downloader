import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PublicationVerificationResume } from "./publication-verification-resume";

describe("受管发布验证恢复", () => {
  it("要求二次确认，提交中与成功后都不会重复调用", async () => {
    let resolveResume: (() => void) | undefined;
    const onResume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveResume = resolve;
        }),
    );
    render(<PublicationVerificationResume onResume={onResume} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "我已完成验证，继续原任务",
      }),
    );
    expect(onResume).not.toHaveBeenCalled();

    const confirm = screen.getByRole("button", {
      name: "确认验证完成并继续",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "正在继续原任务…" })).toBeDisabled();

    resolveResume?.();
    expect(
      await screen.findByText("恢复请求已受理，正在原页面继续，请勿重复提交。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认验证完成并继续" })).not.toBeInTheDocument();
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it.each(["发布任务当前未等待安全验证", "Failed to fetch"])(
    "失败时保留确认入口并允许重试：%s",
    async (message) => {
      const onResume = vi
        .fn()
        .mockRejectedValueOnce(new Error(message))
        .mockResolvedValueOnce(undefined);
      render(<PublicationVerificationResume onResume={onResume} />);

      fireEvent.click(
        screen.getByRole("button", {
          name: "我已完成验证，继续原任务",
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "确认验证完成并继续" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(`继续失败：${message}`);
      expect(screen.getByText("原发布任务已暂停，正在等待页面验证")).toBeInTheDocument();
      const retry = screen.getByRole("button", {
        name: "确认验证完成并继续",
      });
      expect(retry).toBeEnabled();

      fireEvent.click(retry);
      await waitFor(() => expect(onResume).toHaveBeenCalledTimes(2));
      expect(
        await screen.findByText("恢复请求已受理，正在原页面继续，请勿重复提交。"),
      ).toBeInTheDocument();
    },
  );
});
