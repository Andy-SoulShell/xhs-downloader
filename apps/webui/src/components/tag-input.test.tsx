import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { TagInput } from "./tag-input";

function Harness({
  initial = [] as string[],
  limit,
  onChange = vi.fn(),
}: {
  initial?: string[];
  limit?: number;
  onChange?: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState(initial);
  return (
    <TagInput
      limit={limit}
      onChange={(next) => {
        setTags(next);
        onChange(next);
      }}
      tags={tags}
    />
  );
}

function type(value: string) {
  const input = screen.getByLabelText("话题标签");
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("话题标签输入", () => {
  it("回车确认标签并清空输入", () => {
    render(<Harness />);

    const input = type("露营");
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("#露营")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("逗号同样确认标签", () => {
    render(<Harness />);

    fireEvent.keyDown(type("户外"), { key: "," });

    expect(screen.getByText("#户外")).toBeInTheDocument();
  });

  it("去掉用户输入的井号并忽略空白", () => {
    render(<Harness />);

    fireEvent.keyDown(type("  #露营  "), { key: "Enter" });
    fireEvent.keyDown(type("   "), { key: "Enter" });

    expect(screen.getByText("#露营")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("重复标签不会再次加入", () => {
    render(<Harness initial={["露营"]} />);

    fireEvent.keyDown(type("露营"), { key: "Enter" });

    expect(screen.getAllByText("#露营")).toHaveLength(1);
  });

  it("点击可删除单个标签", () => {
    render(<Harness initial={["露营", "户外"]} />);

    fireEvent.click(screen.getByRole("button", { name: "删除标签 露营" }));

    expect(screen.queryByText("#露营")).not.toBeInTheDocument();
    expect(screen.getByText("#户外")).toBeInTheDocument();
  });

  it("输入为空时退格删除上一个标签", () => {
    render(<Harness initial={["露营", "户外"]} />);

    fireEvent.keyDown(screen.getByLabelText("话题标签"), { key: "Backspace" });

    expect(screen.queryByText("#户外")).not.toBeInTheDocument();
    expect(screen.getByText("#露营")).toBeInTheDocument();
  });

  it("达到上限后停止接受并说明原因", () => {
    render(<Harness initial={["甲", "乙"]} limit={2} />);

    expect(screen.getByLabelText("话题标签")).toBeDisabled();
    expect(screen.getByText("最多 2 个标签")).toBeInTheDocument();
  });

  it("失焦时确认尚未提交的输入", () => {
    render(<Harness />);

    const input = type("露营");
    fireEvent.blur(input);

    expect(screen.getByText("#露营")).toBeInTheDocument();
  });
});
