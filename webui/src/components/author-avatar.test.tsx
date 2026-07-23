import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthorAvatar } from "./author-avatar";

describe("作者头像", () => {
  it("优先展示真实头像", () => {
    render(
      <AuthorAvatar
        name="合成作者"
        src="https://example.invalid/avatar.jpeg"
      />,
    );

    expect(screen.getByAltText("合成作者的头像")).toHaveAttribute(
      "src",
      "https://example.invalid/avatar.jpeg",
    );
  });

  it("头像加载失败时回退到昵称首字", () => {
    render(
      <AuthorAvatar
        name="合成作者"
        src="https://example.invalid/avatar.jpeg"
      />,
    );

    fireEvent.error(screen.getByAltText("合成作者的头像"));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("合")).toBeInTheDocument();
  });
});
