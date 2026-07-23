# xhs-downloader

小红书（XiaoHongShu / RedNote）作品信息解析与媒体下载工具，提供 WebUI、CLI、
HTTP API、MCP、Python 客户端和浏览器扩展。

## 设计特点

- 领域、应用、基础设施和用户接口分层，CLI 不包含业务逻辑。
- 配置由 Pydantic 验证，通过 `.env` 或 `XHS_` 环境变量统一管理。
- 下载完成后记录内容指纹、文件大小和 SHA-256；只有三者一致才跳过下载。
- 未完成文件保存在隐藏状态目录，可安全续传；完成后原子替换目标文件。
- 应用、Uvicorn 与 FastMCP 日志统一接入 Loguru，并抑制敏感请求 URL。
- WebUI 使用 React、Vite、Tailwind CSS 与 Radix UI，敏感配置仅保留在服务端。
- 浏览器扩展只读取当前帖子页面已有数据，不申请 Cookie 权限；本地服务离线时也
  能使用浏览器下载。
- 每个代码文件不超过 300 行，并由自动化测试检查公开接口 docstring。

## 环境要求

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Node.js 22.12+
- [pnpm](https://pnpm.io/)

## 安装

```shell
uv sync
```

查看命令：

```shell
uv run xhs-downloader --help
```

也可以直接使用：

```shell
uv run python main.py --help
```

## 配置

```shell
cp .env.example .env
```

程序按以下优先级读取配置：

1. CLI 显式参数
2. `XHS_` 前缀环境变量
3. `.env`
4. 内置默认值

常用变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `XHS_WORK_PATH` | `volume` | 数据根目录 |
| `XHS_FOLDER_NAME` | `download` | 媒体目录名称 |
| `XHS_COOKIE` | 空 | 小红书网页版 Cookie |
| `XHS_PROXY` | 空 | HTTP/SOCKS 代理 |
| `XHS_TIMEOUT` | `15` | 请求超时秒数 |
| `XHS_MAX_RETRY` | `3` | 最大重试次数 |
| `XHS_MAX_CONCURRENCY` | `4` | 最大并发下载数 |
| `XHS_IMAGE_FORMAT` | `jpeg` | `auto/png/webp/jpeg/heic/avif` |
| `XHS_DOWNLOAD_RECORD` | `true` | 启用指纹下载记录 |
| `XHS_RECORD_DATA` | `false` | 保存结构化作品元数据 |
| `XHS_SERVER_HOST` | `0.0.0.0` | API/MCP 监听地址 |
| `XHS_SERVER_PORT` | `5556` | API/MCP 监听端口 |

完整配置见 [.env.example](.env.example)。

## CLI

下载作品：

```shell
uv run xhs-downloader download "小红书作品链接"
```

下载指定图片：

```shell
uv run xhs-downloader download "小红书作品链接" -i 1 -i 3
```

强制重新下载：

```shell
uv run xhs-downloader download "小红书作品链接" --force
```

只解析详情：

```shell
uv run xhs-downloader detail "小红书作品链接"
```

## WebUI

先启动 FastAPI：

```shell
uv run xhs-downloader api
```

再打开另一个终端启动前端：

```shell
pnpm --dir webui install
pnpm --dir webui dev
```

浏览器访问 `http://127.0.0.1:5173`。开发服务器会将 `/api` 请求代理到
`http://127.0.0.1:5556`；如需调整地址，复制并修改
[`webui/.env.example`](webui/.env.example)。

生产构建：

```shell
pnpm --dir webui build
```

构建产物位于 `webui/dist/`，不提交到仓库。Cookie、代理、下载目录等敏感配置
仍由服务端 `.env` 管理，WebUI 不会将其写入浏览器存储。

## 浏览器扩展

构建扩展：

```shell
pnpm --dir extension install
pnpm --dir extension build
```

在 Chromium 浏览器的扩展管理页启用开发者模式，选择“加载已解压的扩展程序”，
然后打开 `extension/dist/`。访问小红书帖子详情页后，可通过页面右下角的“下载”
按钮或浏览器工具栏入口打开面板。

扩展提供三种模式：

- `自动选择`：检测到本地服务时交给后台下载，否则使用浏览器下载。
- `浏览器下载`：始终由浏览器直接下载，服务未启动也可使用。
- `后台下载`：始终使用本地服务的缓存、代理、校验、目录、断点和重试能力。

独立模式的下载结果保存在扩展本地存储中；服务恢复后，面板会提供显式同步入口。
扩展只申请当前小红书帖子页、浏览器下载、本地存储和本机服务地址所需权限，不读取
或保存浏览器 Cookie、密钥和密码。

## HTTP API

```shell
uv run xhs-downloader api
```

- 文档：`http://127.0.0.1:5556/docs`
- 健康检查：`GET /health`
- 作品接口：`POST /xhs/detail`
- 扩展能力：`GET /extension/capabilities`
- 扩展记录：`GET/POST /extension/records`

```json
{
  "url": "小红书作品链接",
  "download": true,
  "index": [1, 3],
  "force": false
}
```

Cookie 和代理统一从 `.env` 读取；如需仅覆盖本次 API 请求的 Cookie，可在请求
体中传入 `cookie`。

## MCP

```shell
uv run xhs-downloader mcp
```

Streamable HTTP 地址：`http://127.0.0.1:5556/mcp`

工具：

- `get_detail_data`：只解析作品详情。
- `download_detail`：下载媒体，可指定图片序号和强制下载。

## Python

```python
import asyncio

from src import XHS


async def main():
    async with XHS() as client:
        print(await client.detail("小红书作品链接"))
        print(await client.download("小红书作品链接"))


asyncio.run(main())
```

可运行 [example.py](example.py)；示例从 `XHS_EXAMPLE_URL` 环境变量读取链接，
仓库中不保存真实作品或凭据。

## 开发验证

```shell
uv run ruff check .
uv run ruff format --check .
uv run pytest
pnpm --dir webui lint
pnpm --dir webui test
pnpm --dir webui build
pnpm --dir extension check
pnpm --dir extension test
pnpm --dir extension build
```

测试只使用完全合成的数据，不包含真实作品原文、Cookie 或 API Key。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
