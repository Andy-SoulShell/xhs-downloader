# xhs-downloader

小红书（XiaoHongShu / RedNote）作品信息解析与媒体下载工具，提供 WebUI、CLI、
HTTP API、MCP、Python 客户端和浏览器扩展。

## 设计特点

- 使用 uv 与 pnpm 共同管理 Monorepo；API、MCP、CLI、WebUI 和浏览器扩展可独立演进。
- 领域与应用规则位于 `xhs-core`，HTTP、SQLite 和文件系统实现位于
  `xhs-adapters`，CLI 不包含业务逻辑。
- 配置由 Pydantic 验证，通过 `.env` 或 `XHS_` 环境变量统一管理。
- 下载完成后记录内容指纹、文件大小和 SHA-256；只有三者一致才跳过下载。
- 未完成文件保存在隐藏状态目录，可安全续传；完成后原子替换目标文件。
- 应用、Uvicorn 与 FastMCP 日志统一接入 Loguru，并抑制敏感请求 URL。
- WebUI 使用 React、Vite、Tailwind CSS 与 Radix UI，敏感配置仅保留在服务端。
- 浏览器扩展支持扫码登录，并使用当前登录态执行推荐、搜索、详情和资料读取；
  它不能读取 Cookie，只能在明确确认后按小红书站点清理 Cookie。
- 发布草稿、素材、排期和执行状态由本地服务持久化；普通账号的登录态只留在浏览器
  创作中心，扩展不会读取或传输 Cookie。
- 后台下载先写入 SQLite 任务队列再执行，支持幂等提交、进程重启恢复和失败重试。
- 每个代码文件不超过 300 行，并由自动化测试检查公开接口 docstring。

## 环境要求

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Node.js 22.12+
- [pnpm](https://pnpm.io/)

## 安装

```shell
uv sync
pnpm install
```

查看命令：

```shell
uv run xhs-downloader --help
```

也可以直接使用：

```shell
uv run python main.py --help
```

面向普通用户的一体化桌面包会同时启动本机 API 与 WebUI，配置和数据在升级时保留。
构建、平台要求、签名、公证与升级步骤见
[桌面安装包与升级](docs/desktop-distribution.md)。未签名或未公证的本地构建只作为
开发验收包，不作为正式公开安装包。

## 工作区结构

```text
apps/
  api/          FastAPI 服务及组合根
  cli/          Typer 命令行应用
  mcp/          FastMCP 服务
  webui/        React 管理界面
  extension/    浏览器扩展
packages/
  xhs-core/       领域模型、端口和应用服务
  xhs-adapters/   HTTP、SQLite、文件系统等实现
  xhs-sdk/        Python 客户端
  xhs-contracts/  WebUI 与扩展共享的 TypeScript 契约
```

依赖方向为 `apps → xhs-adapters → xhs-core`。各应用之间禁止直接导入；
`xhs-sdk` 作为独立客户端入口复用核心能力和适配器。

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
| `XHS_PUBLISH_MAX_ASSET_SIZE` | `1073741824` | 单个发布素材上限，单位为字节 |
| `XHS_PUBLISH_LEASE_SECONDS` | `300` | 浏览器执行发布任务的租约秒数 |
| `XHS_ROUTE_STRATEGY` | `browser_only` | `http_only/browser_only/http_first/browser_first` |
| `XHS_BROWSER_DRIVER` | `extension` | `extension/managed` 浏览器执行器 |
| `XHS_SERVER_HOST` | `127.0.0.1` | API 监听地址；MCP 默认沿用，局域网访问需显式改为 `0.0.0.0` |
| `XHS_SERVER_PORT` | `5556` | API 端口；MCP 默认使用下一个端口 |

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
uv run xhs-api
```

再打开另一个终端启动前端：

```shell
pnpm --filter xhs-downloader-webui dev
```

浏览器访问 `http://127.0.0.1:5173`。开发服务器会将 `/api` 请求代理到
`http://127.0.0.1:5556`；如需调整地址，复制并修改
[`apps/webui/.env.example`](apps/webui/.env.example)。

生产构建：

```shell
pnpm --filter xhs-downloader-webui build
```

构建产物位于 `apps/webui/dist/`，不提交到仓库。WebUI 的“服务配置”页面可集中维护
`.env`；Cookie 与代理只允许覆盖或清除，服务端不会返回原文，WebUI 也不会将其
写入浏览器存储。配置端点只接受本机回环地址发起的请求。Cookie、代理、HTTP
参数、访问路由与浏览器驱动会等待当前请求结束后原子热替换；目录、监听地址和
并发等其余配置仍会明确提示重启。

管理后台包含帖子列表、浏览器扫码与会话管理、内容探索、扩展心跳、受管浏览器
安装检测与启停、操作记录、发布中心、持久化下载任务、扩展独立下载记录和服务配置。
关闭 WebUI 不会中断已经提交的后台任务；重新打开后会从服务端恢复任务和完成状态。
帖子详情解析成功后会立即写入本地 SQLite，即使尚未下载，刷新或重启 WebUI 也会
恢复到帖子列表；从列表移除时会同步删除这条采集记录。

## 内容发布

内容发布采用“本地服务保存任务，浏览器扩展操作官方创作中心”的协作方式，适用于
已经能够正常登录创作中心的普通账号。服务端不调用非公开发布接口，也不读取浏览器
Cookie。

使用前：

1. 启动 API 和 WebUI，并按下文安装或重新加载浏览器扩展。
2. 在同一 Chromium 浏览器中登录
   [小红书创作中心](https://creator.xiaohongshu.com/publish/publish)。
3. 在 WebUI 的“发布中心”创建草稿，填写内容并添加图片或视频。

发布模式：

- `立即发布`：冻结当前草稿为发布任务，立即打开创作中心；扩展填充素材和正文，
  聚焦官方“发布”按钮并发送浏览器可信输入，平台确认成功后关闭创作页。
- `本地定时`：保存带时区的计划时间；到期后扩展领取任务并打开创作中心执行。浏览器
  完全退出时，扩展闹钟无法唤醒浏览器，因此本地服务、浏览器和扩展必须届时运行。
- `官方定时`：现在打开创作中心，把 1 小时至 14 天内的时间交给小红书官方排期；
  完成提交后不要求本机在实际发布时间保持运行。

图文草稿支持 1–18 张图片，视频草稿支持一个视频，二者不能混用。提交任务时会冻结
标题、正文、标签、可见范围、原创声明、商品、素材顺序、大小和 SHA-256；之后修改草稿
不会改变已经排期的内容。商品只有一个明确搜索结果时才会绑定，视频会等待上传和平台
处理完成。立即发布、两种定时和商品绑定均需在 WebUI 二次确认。

任务使用短期租约避免多个标签页重复执行。尚未点击发布时发生中断，任务可以安全回到
队列；点击发布后若平台结果无法确认，任务进入“需要确认”，不会盲目重试。请先到创作
中心核对实际结果，再在 WebUI 中明确标记“已发布”或“未发布”；只有后者会转为可重试
的明确失败。平台页面结构变化、登录失效、账号风控或平台审核都可能要求人工处理。

## 浏览器扩展

构建扩展：

```shell
pnpm --filter xhs-downloader-extension build
```

在 Chromium 浏览器的扩展管理页启用开发者模式，选择“加载已解压的扩展程序”，
然后打开 `apps/extension/dist/`。访问小红书帖子详情页后，可通过页面右下角的“下载”
按钮或浏览器工具栏入口打开面板。

扩展提供三种模式：

- `自动选择`：检测到本地服务时交给后台下载，否则使用浏览器下载。
- `浏览器下载`：始终由浏览器直接下载，服务未启动也可使用。
- `后台下载`：始终使用本地服务的缓存、代理、校验、目录、断点和重试能力。

独立模式的下载结果保存在扩展本地存储中；服务恢复后，面板会提供显式同步入口。
后台模式只负责提交持久化任务，任务由本地服务继续执行，可在 WebUI 中查看和重试。

扩展还会轮询通用浏览器任务，并在官方创作中心执行已领取的发布任务；每次通过能力
令牌认证都会刷新服务端最近心跳。发布排期使用 `alarms` 权限轮询到期任务。小红书
发布控件不接受脚本合成点击，因此扩展会用 `debugger` 权限在当前任务所属的创作页发送
一次可信键盘输入，随后立即释放调试会话；该能力不能由其他标签页或失效租约触发。首次
联动时，扩展只向回环地址登记随机能力令牌；服务端仅保存令牌摘要，且登记与使用令牌的
接口都只接受本机回环请求。可在 WebUI 的“探索”页注销扩展登记使旧令牌立即失效，仍在
运行的扩展会自动重新登记。扩展不读取或保存
浏览器 Cookie、密钥和密码。`browsingData` 权限只用于用户二次确认后的
小红书站点 Cookie 清理；二维码图片只在当前调用中短期交付。

自动发布只在扩展打开的创作页执行：手动打开创作中心不会触发排队任务，到期的本地
定时任务由扩展自行打开携带任务参数的创作页完成。

浏览任务失败时，扩展会记录不含页面原文、账号或 URL 参数的兼容性诊断。为排查布局
变化，扩展会先隐藏页面文本和媒体，再截取失败页面；截图只保存在扩展本地，最多两份，
不会上传到 API。

## HTTP API

```shell
uv run xhs-api
```

- 文档：`http://127.0.0.1:5556/docs`
- 健康检查：`GET /health`
- 作品接口：`POST /xhs/detail`
- 扩展能力：`GET /extension/capabilities`
- 扩展记录：`GET/POST /extension/records`
- 采集帖子：`GET /posts`、`DELETE /posts/{work_id}`
- 下载任务：`POST /tasks`
- 浏览器登录状态：`POST /xhs/login/status`
- 浏览器登录二维码：`POST /xhs/login/qrcode`
- 登录会话清理：`POST /xhs/login/cookies/delete`
- 推荐、搜索与详情：`POST /xhs/feeds/list|search|detail`
- 点赞、收藏与评论：`POST /xhs/feeds/like|favorite|comment`
- 用户资料：`POST /xhs/user/profile`、`POST /xhs/user/me`
- 浏览器任务：`GET/POST /browser/tasks`
- 浏览器扩展状态：`GET /browser/extensions`
- 注销扩展登记：`DELETE /browser/extensions/{extension_id}`
- 任务列表：`GET /tasks`
- 任务详情：`GET /tasks/{task_id}`
- 失败重试：`POST /tasks/{task_id}/retry`
- 服务配置：`GET/PUT /settings`（仅允许本机访问，敏感值不会回传）
- 发布草稿：`GET/POST /publication/drafts`
- 草稿更新：`GET/PUT/DELETE /publication/drafts/{draft_id}`
- 发布素材：`POST /publication/drafts/{draft_id}/assets`
- 提交发布：`POST /publication/drafts/{draft_id}/submit`
- 发布任务：`GET /publication/tasks`
- 取消或重试：`POST /publication/tasks/{task_id}/cancel|retry`
- 人工核对：`POST /publication/tasks/{task_id}/review`

发布管理接口只接受本机回环请求。`/publication/extension/*`、发布事件和素材读取接口
仅供已登记扩展使用，需要能力令牌和任务租约，不属于通用远程 API。

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

先启动 FastAPI，再启动 MCP：

```shell
uv run xhs-api
uv run xhs-mcp
```

Streamable HTTP 地址：`http://127.0.0.1:5557/mcp`。可通过 `--api-url`
指定 FastAPI 地址，通过 `--port` 修改 MCP 监听端口。

工具：

- `get_detail_data`：只解析作品详情。
- `download_detail`：下载媒体，可指定图片序号和强制下载。
- `check_login_status`：检查浏览器登录状态。
- `get_login_qrcode`：返回一次性二维码图片，并保持真实登录页供用户扫码。
- `delete_cookies`：显式确认后清理浏览器或 Cookie HTTP 会话。
- `list_feeds`、`search_feeds`：读取推荐和搜索结果。
- `get_feed_detail`：读取帖子详情和已加载评论。
- `user_profile`、`get_my_profile`：读取指定用户或当前账号资料。
- `like_feed`、`favorite_feed`：设置并核验点赞或收藏目标状态。
- `post_comment_to_feed`、`reply_comment_in_feed`：提交并核验评论或回复。
- `publish_content`、`publish_video`：经 FastAPI 上传本地素材并创建发布任务；
  必须先取得用户明确确认并传入 `confirmed=true`。

浏览器能力的迁移边界与后续步骤见
[xiaohongshu-mcp 能力迁移方案](docs/browser-capability-migration.md)。

## Python

```python
import asyncio

from xhs_sdk import XHS


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
pnpm lint
pnpm check
pnpm test
pnpm build
```

测试只使用完全合成的数据，不包含真实作品原文、Cookie 或 API Key。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
