# RyAgent Platform

个人单用户、移动优先的 Agent 控制台。ARTEX 是第一个组件（Connector），不是平台本身。

```text
artex/   ARTEX 渗透测试引擎（Go + Next.js）
bff/     RyAgent BFF（Go）：设备认证、能力聚合、事件、通知、主控对话台
app/     Android App（Expo / React Native）
docs/    平台设计文档（本地，已被 .gitignore 排除）
deploy/  BFF 容器部署
```

- 设计文档：`docs/RyAgent-平台设计.md`
- ARTEX 组件：`artex/README.md`

## 当前能力

- **任务**：新建并启动任务、实时状态、目标进度、严重度统计、暂停/恢复、给任务主 Agent 发指令。
- **对话**：新建 ARTEX 对话、会话列表、消息全文（懒加载）、直接回复；任务详情内展示完整活动流。
- **情报**：监控 `GITHUB_OWNER`（默认 `y1shiny1shin`）关注的人的 Star 与 Release。BFF 通过
  GitHub `received_events` 单次覆盖全部关注，并为近期 Star 补全仓库信息；按仓库 / GitHub 事件永久去重。
  默认过滤 push/fork/issue/comment 等噪音，可用 `GITHUB_EVENT_TYPES` 调整，用 `GITHUB_IGNORE_USERS` 忽略账号。
- **情报中心**：只做技术文章，全量拉取公开 RSS/Atom/社区文章，不做关键词过滤：先知社区、安全客、
  Seebug Paper、嘶吼、CN-SEC、腾讯玄武实验室、FreeBuf、The Hacker News、BleepingComputer、
  Krebs on Security、SecurityWeek。使用 ETag/Last-Modified 条件请求、来源冷却和限速，避免反爬。
- **招聘**：定时抓取国聘、猎聘、职友集、国家大学生就业服务平台（NCSS）、看雪招聘、V2EX、RemoteOK，
  按 `~/Downloads/job` 的画像匹配：成都/远程、渗透测试/安全运营/信息安全、本科、约 3 年经验、
  央国企优先、安全厂商降权；按岗位去重。匹配分数与原因会显示在每个岗位卡片和详情页。
- **审批**：ARTEX 工具调用 allow / deny，带任务上下文。
- **主控 AI**：DeepSeek 助手，查询直接回答，可提议新建任务/对话，写操作必须二次确认。
- **设置**：服务器、SecureStore token、重新配对、能力概览。

App 底部导航为「任务 / 对话 / 情报 / 招聘 / 设置」；审批与主控 AI 从任务页头部进入，技术文章从情报页右上角进入。所有页面共用
`app/src/theme.ts` 的设计 token，新增 Connector 只需加一个 Tab + Screen。

## 构建

```bash
make bff           # 本地 BFF（bin/ryagent-bff）
make bff-linux     # linux/amd64 BFF，输出到 deploy/bff/ryagent-bff
make app-release   # Android release APK
make app-install   # 安装到 MuMu 模拟器（adb reverse 8788）
make test          # BFF 测试 + App TypeScript 检查
```

BFF 配置见 `bff/.env.example`。GitHub 关注动态通过 `GITHUB_OWNER`、`GITHUB_TOKEN`、
`GITHUB_REFRESH_MINUTES`、`GITHUB_PROXY` 调整。`received_events` 单次覆盖全部关注；
配置 `GITHUB_TOKEN` 可提高限流额度，并为更多 Star 补全仓库描述/star 数。

招聘雷达通过 `JOB_REFRESH_HOURS`、`JOB_CITY`、`JOB_KEYWORDS`、`JOB_MIN_SCORE`、
`JOB_MAX_AGE_DAYS`、`JOB_SOURCES`、`JOB_PROXY` 调整。默认数据源
`iguopin,liepin,jobui,ncss,kanxue,v2ex,remoteok`，默认城市成都，最低匹配分 45。

安全情报通过 `INTEL_REFRESH_MINUTES`、`INTEL_PROXY` 调整；`GITHUB_TOKEN` 会同时用于
GitHub Advisory API 提高限流额度。

## 自动更新

BFF 启动后自动运行，不需要 App 常驻：

- **技术文章**：每 3 天检查一次；`INTEL_REFRESH_MINUTES=4320`
- **GitHub 关注**：每 3 天；`GITHUB_REFRESH_MINUTES=4320`
- **招聘**：每 3 天；`JOB_REFRESH_HOURS=72`

默认每 3 天更新一次；App 只读取 BFF 缓存，不依赖手机后台运行。

## 安全

- 服务器地址、密码、API Key 只放本地 `tmp/`、`bff/.env`、环境变量。
- `docs/`、`tmp/`、`keys/`、`.env` 已在 `.gitignore` 中排除。
- App token 仅存于 Android SecureStore，配对密码不落盘。
