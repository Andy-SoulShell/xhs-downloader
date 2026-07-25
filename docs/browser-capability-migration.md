# xiaohongshu-mcp 能力迁移方案

## 目标

将 `xiaohongshu-mcp` 依赖独立浏览器进程完成的浏览、互动和发布能力迁入
`xhs-downloader`，复用现有 FastAPI、WebUI、MCP、SQLite、浏览器扩展和受管
Chromium。
迁移能力，不复制原项目的 Go/Rod 实现。

核心边界：

- 浏览器登录态只留在扩展所在浏览器或应用专用受管 Profile；HTTP Cookie 只留在
  本机服务配置。
- FastAPI 是任务、权限、状态和审计的唯一事实来源。
- MCP 与 WebUI 只调用 FastAPI，不直接调用扩展或数据库。
- 扩展与受管 Worker 只领取经过服务端验证且已冻结目标驱动的任务，并回传封闭的
  结构化结果。
- 写操作必须可核验；结果不确定时进入 `needs_review`，禁止自动重试。

## 架构

```mermaid
flowchart LR
  UI["WebUI"] --> API["FastAPI 类型化接口"]
  MCP["FastMCP"] --> API
  API --> ROUTER["统一能力路由"]
  ROUTER --> HTTP["Cookie + HTTP"]
  ROUTER --> CORE["浏览器任务应用服务"]
  CORE --> DB["SQLite 任务、幂等键与租约"]
  EXT["浏览器扩展"] -->|"登记、领取、回传"| API
  MANAGED["受管 Chromium Worker"] -->|"领取、执行、回传"| CORE
  EXT -->|"当前登录态"| XHS["小红书网页"]
  MANAGED -->|"专用持久化 Profile"| XHS
  HTTP -->|"用户显式配置的 Cookie"| XHS
```

任务状态为：

```text
queued → claimed → running → succeeded | failed | needs_review
```

只读任务租约过期后可回队列；可能产生外部副作用的任务一旦开始执行，
租约过期后必须转为 `needs_review`。

发布继续使用独立的草稿与发布任务状态机。草稿在提交时冻结内容指纹和
素材 SHA-256；发布结果不确定时同样进入 `needs_review`，必须先人工标记
“已发布”或“未发布”，不得直接重试。

## 能力分组

| 原能力 | 目标入口 | 状态 | 迁移策略 |
| --- | --- | --- | --- |
| 检查登录 | API、MCP、WebUI | 已完成 | 读取页面登录标记，不返回 Cookie |
| 首页推荐 | API、MCP、WebUI | 已完成 | 解析页面状态并验证 Feed Schema |
| 关键词搜索 | API、MCP、WebUI | 已完成 | 有界等待页面实时搜索结果，避免异步容器先于内容返回 |
| 搜索筛选 | API、MCP | 已完成 | 操作筛选面板并读取更新后的页面状态 |
| 帖子详情 | API、MCP、WebUI | 已完成 | 返回正文、媒体、互动数据和已加载评论 |
| 有界评论加载 | API、MCP | 已完成 | 滚动、回复展开、数量上限和停滞检测 |
| 指定用户主页 | API、MCP | 已完成 | 解析资料、统计项和帖子摘要 |
| 当前账号主页 | API、MCP | 已完成 | 通过侧边栏站内导航后解析 |
| 点赞/取消点赞 | API、MCP、WebUI | 已完成 | 目标状态语义，操作后重新读取并核验 |
| 收藏/取消收藏 | API、MCP、WebUI | 已完成 | 目标状态语义，操作后重新读取并核验 |
| 发表评论 | API、MCP、WebUI | 已完成 | 幂等请求、提交后查找新评论并核验 |
| 回复评论 | API、MCP、WebUI | 已完成 | 评论 ID 或用户 ID 定位、有界滚动和提交后核验 |
| 扩展在线状态 | API、WebUI | 已完成 | 持久化登记与最近认证心跳，按轮询周期判断在线 |
| 操作审计记录 | API、WebUI | 已完成 | 展示脱敏任务状态、尝试次数与人工核对提示 |
| 图文/视频发布 | API、MCP、WebUI、扩展、受管浏览器 | 已完成 | 草稿、素材指纹、租约、结果核验和显式确认；受管首期只允许私密发布 |
| 原创声明 | API、MCP、WebUI、扩展、受管浏览器 | 已完成 | 只支持图文，设置目标状态后重新读取核验 |
| 可见范围 | API、MCP、WebUI、扩展、受管浏览器 | 已完成 | 扩展支持公开、仅自己和仅互关好友；受管首期只支持仅自己 |
| 商品绑定 | API、MCP、WebUI、扩展 | 已完成 | 只选择唯一匹配；歧义、缺失或不可确认时中止；受管首期不支持 |
| 官方定时发布 | API、MCP、WebUI、扩展、受管浏览器 | 已完成 | 与本地排期分离，限制为 1 小时至 14 天 |
| 视频处理状态 | 扩展、受管浏览器 | 已完成 | 等待上传和转码结束，识别失败与超时后中止 |
| 页面兼容性诊断 | 扩展、SQLite | 已完成 | 记录适配器版本、页面类型和语义锚点，不记录原文 |
| 失败截图 | 扩展本地 | 已完成 | 隐藏文本与媒体后截图，只保留最近两份且不上传 |
| 长内容与分页元数据 | API、扩展 | 已完成 | 有界截断、结果上限、游标和 `has_more` |
| 二维码登录 | API、MCP、WebUI、扩展、受管浏览器 | 已完成 | 从真实登录页一次性交付短期图片，保留标签页完成扫码握手 |
| 删除 Cookie | API、MCP、WebUI、扩展、受管浏览器 | 已完成 | 扩展通过 `browsingData` 按来源清理，受管浏览器只清理专用上下文中的小红书域，HTTP 模式清除配置并热替换客户端 |

“已完成”表示接口、任务状态、扩展适配器和自动化测试已经接入，不等同于所有账号
和平台风控条件下都已真实通过。2026-07-25 的真实验收修正如下：

- 点赞与取消点赞真实通过。
- 收藏与取消收藏已迁移到扩展后台受控可信鼠标输入，启用和取消均通过跨页面
  目标状态回读，验收结束时恢复为未收藏。
- 评论能完成输入和点击，但平台安全扫码会中断提交；回复因此尚未进入真实写入。
- 扩展已为收藏和发布提供任务级授权的可信输入；评论与回复仍需迁移并补全
  安全验证后的原任务恢复。`ManagedBrowserProvider` 已成为无扩展安装场景的
  写入实现，但扫码登录后的真实写验收尚未完成。
- 安全验证必须保留原页面并暂停、恢复同一个任务，不能关闭页面后创建新任务重试。

2026-07-25 已补充受管浏览器与统一路由链路：

- 专用 Chromium 生命周期、持久化 Profile、单实例锁和回环 CDP 已实现。
- 浏览器任务增加固定目标驱动和通用执行器标识；扩展与受管 Worker 按驱动隔离
  领取，旧 SQLite 表自动回填为扩展任务。
- Playwright 通过 CDP 连接现有 Chromium，并注入由扩展源码生成的共享页面
  适配器；登录状态、二维码、推荐、搜索、详情和主页无需维护第二套选择器。
- 本机真实 Chromium 已通过启动、CDP 连接、共享适配器执行、Playwright 断开后
  会话继续存活以及安全停止的合成页面连通性验收。
- 读取接口已支持 `http_only`、`browser_only`、`http_first` 和
  `browser_first`，成功响应包含实际来源、尝试顺序与安全回退原因；只有尝试过
  浏览器 Provider 时才包含冻结的浏览器驱动。
- Cookie、代理和路由字段会排空当前请求后原子热替换；写任务在提交时冻结所选
  浏览器驱动，禁止跨模式自动重试。
- HTTP 统一读取 Provider 已支持推荐、默认筛选搜索、详情、指定主页和严格身份
  确认后的当前主页；非默认筛选会先验证 Cookie 会话，再明确回退浏览器，避免把
  已过期 Cookie 误归为无法验证，不扩展到写操作。
- 扩展五项读取、受管 Profile 的推荐/搜索/详情/指定与当前主页，以及未配置
  Cookie 时 HTTP→受管浏览器安全回退已真实通过；当前过期 Cookie→扩展的安全
  回退也已通过，更新 Cookie 后的 HTTP 成功路径仍待现场确认。
- 受管 Chromium 被强制终止后能准确报告异常，重新启动会取得新的回环 CDP 端口并
  恢复真实读取，不影响用户日常 Chrome。
- 受管点赞和收藏已实现目标状态预检、可信点击、严格回读和
  `failed/needs_review` 分界；登录 Profile 中两项均真实切换成功并恢复原状态。
- 受管私密图文、视频和平台定时发布已接入共享 Chromium、独占执行闸门及 API
  生命周期；安全验证可保留原页面进入 `awaiting_verification`，用户确认后恢复
  同一任务且不会重复点击发布。上述写能力的真实验收仍需用户在最终提交前确认。
- WebUI 已按冻结驱动区分扩展与受管发布；受管模式不会打开日常浏览器创作页，并在
  提交前禁用非私密可见范围和商品绑定。浏览器失败记录只展示和复制严格白名单中的
  脱敏页面诊断。
- 混合路由已接入一次性账号一致性门禁：HTTP 在 Provider 内计算 HMAC，协议 5
  扩展通过独立内存 Claim/Answer 通道计算，受管浏览器通过同一 Profile 的 CDP
  旁路计算。只有 `matched` 允许跨 Provider 回退；挑战不进入浏览器任务、SQLite、
  浏览器存储、日志或诊断。协议 5 挑战通道构建已真实重载并完成响应；随后补充的
  页面水合后 DOM 账号识别兜底已构建、待再次重载。受管真实页面已返回
  `proved`；当前 HTTP Cookie 已过期，刷新 Cookie 后的 `matched/different`
  现场矩阵仍待复验。

## 类型化 API

面向 WebUI 和 MCP：

- `POST /xhs/login/status`
- `POST /xhs/login/qrcode`
- `POST /xhs/login/cookies/delete`
- `POST /xhs/feeds/list`
- `POST /xhs/feeds/search`
- `POST /xhs/feeds/detail`
- `POST /xhs/user/profile`
- `POST /xhs/user/me`
- `POST /xhs/feeds/like`
- `POST /xhs/feeds/favorite`
- `POST /xhs/feeds/comment`
- `POST /xhs/feeds/comment/reply`

发布管理：

- `POST /publication/drafts`
- `PUT /publication/drafts/{draft_id}`
- `POST /publication/drafts/{draft_id}/assets`
- `POST /publication/drafts/{draft_id}/submit`
- `POST /publication/tasks/{task_id}/review`
- `POST /publication/tasks/{task_id}/retry`
- `POST /publication/tasks/{task_id}/verification/resume`

`submit` 的模式含义：

- `manual`：由任务冻结的浏览器执行器立即打开创作页并发布。
- `scheduled`：本机到期后才由所选浏览器执行器执行，届时本机服务和对应浏览器
  必须在线。
- `platform_scheduled`：由所选浏览器执行器按 `Asia/Shanghai` 填写创作页，
  通过可信输入把绝对时间交给小红书官方排期；验收必须回读平台的非零
  `schedule_post_time`。

草稿提交会生成持久化发布任务，后续通过查询、人工核对和显式重试管理状态。
`/browser/tasks` 支持幂等提交、查询与重试，带 `wait_seconds` 的有界等待由
`/xhs/*` 类型化能力接口提供；扩展的任务领取入口也支持独立的有界等待。本机管理
界面通过 `GET /browser/extensions` 读取扩展登记和最近心跳。

协议 5 扩展还使用两个独立的进程内账号证明入口：

- `POST /browser/extension/account-challenges/claim`
- `POST /browser/extension/account-challenges/{challenge_id}/answer`

它们复用扩展 Bearer Token 和来源校验，回答额外要求一次性挑战租约；成功响应不会
返回账号是否一致，该结论只由服务端路由器计算。

本机通用任务接口可通过 `target_driver=extension|managed` 冻结执行驱动；
普通读取接口由服务端统一路由，调用方不能自行重试写操作或实现跨驱动回退。

## 数据与安全

- 输入按任务类型使用 Pydantic 模型验证并补全默认值，再计算幂等语义。
- 扩展成功结果必须通过对应结果模型验证，额外字段会被拒绝。
- `xsec_token` 仅作为站内导航输入，不进入日志或用户可见状态说明。
- 公开测试只使用合成 ID、合成文本和保留测试域名。
- 扩展不申请 Cookie 权限；小红书页面权限由内容脚本匹配范围限定。
- 扩展使用 `browsingData` 只清理小红书来源的 Cookie，不能读取 Cookie 内容。
- 二维码只接受受限图片 Data URL；API 响应后立即擦除持久化任务中的图片，
  MCP 以图片内容块交付，结构化结果不保留 Base64。
- 心跳只保存扩展标识和认证时间，不包含浏览历史、账号信息或页面内容。
- 管理接口只允许本机调用；扩展接口要求来源匹配、能力令牌和任务租约。
- MCP 发布只接受用户明确提供的普通文件绝对路径，素材仍由 FastAPI 校验。
- `publish_content` 和 `publish_video` 必须传入 `confirmed=true`；工具声明为
  非幂等的外部写操作，MCP 客户端不能绕过确认。
- 发布商品会在最终确认区逐项展示；扩展不会自动选择“第一个结果”。
- 失败诊断只包含固定语义锚点；脱敏截图仅存在扩展本地存储，不上传 API。

## 实施批次

1. P0：通用任务、扩展租约、登录、推荐、搜索、详情、评论和主页。
2. P1：点赞、收藏、评论、回复、目标状态核验、审计与人工确认。
3. P2：发布选项、视频处理、官方定时、MCP 发布和 WebUI 二次确认。
4. P3：协议版本、选择器兼容诊断、脱敏失败证据、断线恢复和结果上限。
5. P4：二维码登录、一次性交付和浏览器/HTTP 双会话清理。
6. P5：受管 Chromium 生命周期、统一读取路由、互动、私密发布和验证恢复。
7. P6：跨 Provider 一次性账号证明、协议 5 内存通道和脱敏路由结论。

真实页面变化不属于可静态锁定的完成项。后续维护以脱敏诊断中的适配器版本、
页面类型和缺失锚点为依据更新合成契约夹具；不得提交真实帖子、Cookie、
截图或用户原文。

Cookie + HTTP、浏览器扩展、受管浏览器和自动路由的后续讨论见
[普通用户自动化访问模式设计讨论](automation-access-modes.md)。

## 验收标准

- Python 通过 Ruff、格式检查和 Pytest。
- WebUI 通过 lint、测试、生产构建及宽窄屏核心交互验收。
- 扩展通过 TypeScript、测试、生产构建和清洁配置文件安装验收。
- 受管 Chromium 通过专用 Profile、单实例锁、回环 CDP、登录持久化、正常关闭和
  异常退出恢复验收。
- Cookie + HTTP、扩展和受管浏览器通过四种路由策略的完整端到端验收。
- 任务重启后可恢复，重复请求不会产生重复写操作。
- 失败、超时和不确定结果对用户可见，不得以空结果伪装成功。
- 个性化读取发生跨 Provider 回退前，一次性账号相等性挑战必须返回 `matched`。
- 发布、评论和回复必须覆盖成功、明确失败与结果不确定三条状态路径。
- WebUI 的立即发布、本地定时、官方定时和人工核对均需二次确认。
