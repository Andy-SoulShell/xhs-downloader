# 桌面安装包与升级

桌面版把 FastAPI 与生产 WebUI 打包为一个本机应用。双击后仅监听
`127.0.0.1:5556`，服务就绪后打开 `http://127.0.0.1:5556/ui/`，不会使用
`file://` 加载界面。再次启动时会识别已经运行的 xhs-downloader，并只打开管理界面。

## 构建

构建机需要 Python 3.12、uv、Node.js 22.12 和 pnpm。运行受管浏览器还需要本机安装
Google Chrome、Chromium 或 Microsoft Edge。macOS 包的最低系统版本是 13.5，这是
内置 Playwright 驱动的实际最低版本，不支持在更早系统上降级运行。

```shell
uv sync
pnpm install --frozen-lockfile
uv run python -m scripts.build_desktop
```

脚本会依次：

1. 使用同源 API 路径和 `/ui/` 资源基址构建 WebUI。
2. 构建浏览器扩展。
3. 使用 PyInstaller 生成当前平台的一目录桌面程序。
4. 用临时配置和数据目录启动未压缩成品，实际请求 `/health` 与 `/ui/`。
5. 生成当前平台归档，并从最终归档重新解压、验签和执行相同 HTTP 冒烟。
6. 检查归档不含 `.env`、数据库、日志或浏览器 Profile，再生成扩展 ZIP、
   `release-manifest.json` 和 `SHA256SUMS`。

发布文件位于 `build/releases/<版本>/`。macOS、Windows 使用 ZIP；Linux 使用保留
链接和可执行位的 `.tar.gz`。macOS 用户运行 `xhs-downloader.app`，Windows 或 Linux
用户运行解压目录内的同名可执行文件。浏览器扩展 ZIP 解压后，通过 Chromium 的
“加载已解压的扩展程序”选择 `xhs-downloader-extension/`。

macOS 正式发行前，把 Developer ID 和 `notarytool` 钥匙串配置名传给构建：

```shell
XHS_BUILD_MACOS_SIGN_IDENTITY="Developer ID Application: ..." \
XHS_BUILD_MACOS_NOTARY_PROFILE="xhs-downloader-notary" \
uv run python -m scripts.build_desktop
```

构建会启用 hardened runtime、等待 Apple 公证并装订票据。没有这两个变量时，
`release-manifest.json` 会明确标记为 `development_preview`；此类临时签名包会被
Gatekeeper 拒绝，不能作为普通用户正式发行包。Windows 正式发行也必须在对应 CI
构建机使用 Authenticode 签名，否则可能被 SmartScreen 拦截。每个平台和架构必须在
自身构建机生成并验收，不能用 macOS arm64 的通过结果代替其他平台。

## 持久化目录

配置和用户数据使用操作系统标准目录，不放在程序包中：

- macOS：`~/Library/Application Support/xhs-downloader`
- Windows：用户的本地应用数据目录下 `xhs-downloader`
- Linux：`${XDG_CONFIG_HOME}`、`${XDG_DATA_HOME}` 对应的
  `xhs-downloader` 目录

首次运行会创建仅保存本机路径的 `.env`。Cookie、代理、数据库、下载内容、发布素材
和受管浏览器 Profile 都不会进入安装包或发布压缩包。

关闭浏览器页面不会停止后台服务。在 WebUI 的“服务配置”底部点击“关闭本地服务”，
服务会先停止任务 Worker 和受管浏览器，再完成优雅退出。再次双击程序只会打开已运行
实例，不会启动第二套服务。

## 升级与回退

升级前从 WebUI 关闭本地服务，备份数据目录，然后解压新版本并替换旧程序目录。
配置与数据位于程序包之外，因此替换应用不会覆盖登录 Profile、任务数据库或下载内容。
启动新版本时，SQLite 仓储会执行兼容的增量建表或字段迁移。

若升级后无法启动，可保留配置与数据目录，重新运行上一个版本的程序包。涉及数据库
结构变更的版本应优先从升级前备份恢复，避免旧版本读取新结构。在发布目录执行
`shasum -a 256 -c SHA256SUMS` 核对校验值，并在干净用户目录完成“启动、打开
WebUI、登录、读取、下载、退出”的端到端验收。
