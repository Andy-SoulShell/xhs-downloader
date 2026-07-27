import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { makeSettingsResponse } from "../test/fixtures";
import { ServiceSettings } from "./service-settings";
import { DownloadSettings, NetworkSettings, StorageSettings } from "./settings-sections";

const values = makeSettingsResponse().values;

describe("配置分组控件", () => {
  it("编辑目录、映射与记录开关", () => {
    const onChange = vi.fn();
    const onMappingChange = vi.fn();
    render(
      <StorageSettings
        mappingRows={[]}
        onChange={onChange}
        onMappingChange={onMappingChange}
        values={values}
      />,
    );

    fireEvent.change(screen.getByLabelText("数据根目录"), {
      target: { value: "/tmp/media" },
    });
    fireEvent.change(screen.getByLabelText("媒体目录名"), {
      target: { value: "assets" },
    });
    fireEvent.click(screen.getByRole("button", { name: "作品ID" }));
    fireEvent.click(screen.getByRole("switch", { name: "作品目录" }));
    fireEvent.click(screen.getByRole("switch", { name: "作者归档" }));
    fireEvent.click(screen.getByRole("switch", { name: "下载记录与校验" }));
    fireEvent.click(screen.getByRole("switch", { name: "保存作品详情" }));
    fireEvent.click(screen.getByRole("switch", { name: "写入发布时间" }));
    fireEvent.click(screen.getByRole("button", { name: "添加一条" }));

    expect(onChange).toHaveBeenCalledTimes(8);
    // 映射改为键值行编辑，新增一行即回传结构化数据而不是 JSON 文本。
    expect(onMappingChange).toHaveBeenCalledWith([
      expect.objectContaining({ authorId: "", displayName: "" }),
    ]);
  });

  it("编辑网络、敏感值和数值边界", () => {
    const onChange = vi.fn();
    const onCookieChange = vi.fn();
    const onProxyChange = vi.fn();
    const onClearCookieChange = vi.fn();
    const onClearProxyChange = vi.fn();
    render(
      <NetworkSettings
        clearCookie={false}
        clearProxy={false}
        cookie=""
        cookieConfigured
        onChange={onChange}
        onClearCookieChange={onClearCookieChange}
        onClearProxyChange={onClearProxyChange}
        onCookieChange={onCookieChange}
        onProxyChange={onProxyChange}
        proxy=""
        proxyConfigured
        values={values}
      />,
    );

    fireEvent.change(screen.getByLabelText("小红书 Cookie"), {
      target: { value: "session=synthetic" },
    });
    fireEvent.change(screen.getByLabelText("代理地址"), {
      target: { value: "http://127.0.0.1:7890" },
    });
    fireEvent.change(screen.getByLabelText("请求超时（秒）"), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("最大重试次数"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("User-Agent"), {
      target: { value: "updated-agent" },
    });

    expect(screen.getByLabelText("小红书 Cookie")).toHaveAttribute("type", "password");
    expect(onCookieChange).toHaveBeenCalledOnce();
    expect(onProxyChange).toHaveBeenCalledOnce();
    expect(onClearCookieChange).toHaveBeenCalledWith(false);
    expect(onClearProxyChange).toHaveBeenCalledWith(false);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("默认收起并展示 HTTP Cookie 安全获取说明", () => {
    render(
      <NetworkSettings
        clearCookie={false}
        clearProxy={false}
        cookie=""
        cookieConfigured={false}
        onChange={vi.fn()}
        onClearCookieChange={vi.fn()}
        onClearProxyChange={vi.fn()}
        onCookieChange={vi.fn()}
        onProxyChange={vi.fn()}
        proxy=""
        proxyConfigured={false}
        values={values}
      />,
    );

    const summary = screen.getByText("如何安全获取 HTTP Cookie（高级）");
    const disclosure = summary.closest("details");
    expect(disclosure).not.toHaveAttribute("open");

    fireEvent.click(summary);

    expect(disclosure).toHaveAttribute("open");
    expect(screen.getByText(/普通用户优先选择浏览器扩展或软件自带浏览器/)).toBeInTheDocument();
    expect(screen.getByText(/分别复制 Cookie 和 User-Agent 后面的值/)).toBeInTheDocument();
    expect(screen.getByText(/不要复制 Set-Cookie、整条 cURL 或其他请求头/)).toBeInTheDocument();
    expect(screen.getByText(/Cookie 只保存在本机且不会再次显示/)).toBeInTheDocument();
  });

  it("编辑下载策略和媒体开关", () => {
    const onChange = vi.fn();
    render(<DownloadSettings onChange={onChange} values={values} />);

    fireEvent.change(screen.getByLabelText("图片格式"), {
      target: { value: "png" },
    });
    fireEvent.change(screen.getByLabelText("视频流偏好"), {
      target: { value: "bitrate" },
    });
    fireEvent.change(screen.getByLabelText("最大并发数"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText("分块大小（字节）"), {
      target: { value: "1048576" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "下载图片" }));
    fireEvent.click(screen.getByRole("switch", { name: "下载视频" }));
    fireEvent.click(screen.getByRole("switch", { name: "下载动态图片" }));

    expect(onChange).toHaveBeenCalledTimes(7);
  });

  it("编辑服务监听与日志配置", () => {
    const onChange = vi.fn();
    render(<ServiceSettings onChange={onChange} values={values} />);

    fireEvent.change(screen.getByLabelText("监听地址"), {
      target: { value: "0.0.0.0" },
    });
    fireEvent.change(screen.getByLabelText("监听端口"), {
      target: { value: "6000" },
    });
    fireEvent.change(screen.getByLabelText("日志级别"), {
      target: { value: "debug" },
    });

    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
