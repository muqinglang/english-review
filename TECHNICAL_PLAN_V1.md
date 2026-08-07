# 英语复习线上服务｜第一期技术方案

## 决策摘要

第一期采用“本机智能 Worker + 远程 API 与学习库”的混合架构；不使用 OpenAI API Key。

- 线上应用/API：Next.js + TypeScript，部署到 Vercel。
- 认证、Postgres 和文件存储：Supabase。
- 本机 Worker：Codex 自动化负责理解 ChatGPT 聊天并按提示词生成结构化结果；Node.js 脚本负责调用远程 API、校验 payload、断点续传与重试。
- 声音：网页使用浏览器原生 `SpeechSynthesis` 朗读远程保存的英语脚本；第一期不生成 MP3。
- 远程数据库只允许由服务端 API 访问；Worker 与网页都不直接连接数据库。

## 为什么这样选

- 不改变 ChatGPT 的聊天体验。
- 单个 Next.js 项目同时承载网页与 API，首发运维最少。
- Supabase 提供托管 Postgres、邮箱登录与存储；后端不需要自己维护用户密码。
- Worker 的“理解与整理”仍使用当前已授权的 Codex 工作流，因此无需 OpenAI Platform 的 API Key。
- 日后开通 API 时，只需新增云端 Worker 实现相同的 API 合同，无需迁移数据库或网页。

## 组件职责

### 1. 本机 Worker

运行方式：沿用每日 Codex 自动化；每次运行由提示词调度 Node.js 脚本。

职责：

1. `GET /api/worker/context` 获取游标、远程学习项摘要、待批改作答和任务配置。
2. 在已有授权范围内读取 ChatGPT 项目新增/更新聊天。
3. 按 `REVIEW_SPEC.md` 提取学习证据、去重、选择复习项、生成复习和浏览器朗读脚本。
4. 对远程待批改作答给出批改结果，并计算间隔复习变更。
5. 调用上传脚本，把结果发送给远程 API；仅在 API 确认后保存本地游标。

本机缓存只保存未成功上传的加密/最小化重试包，不能覆盖远程状态。

### 2. Next.js 线上应用

职责：

- 邮箱魔法链接登录。
- 展示同步状态、今日复习、复习历史和学习项来源。
- 提交用户的文字作答；作答进入待批改队列。
- 播放浏览器原生英语语音；支持正常、慢速与循环播放。
- 提供 Worker 专用 API，验证设备身份、版本号和请求幂等性。

浏览器只调用 Next.js Route Handlers；Route Handler 验证会话/Worker 身份后，使用服务端 Supabase 客户端访问数据库。

### 3. Supabase

职责：

- Auth：邮箱魔法链接。
- Database：Postgres，保存学习证据、总账、复习、作答、同步运行记录。
- Storage：预留给未来 MP3、用户录音和导出文件；第一期可不启用。

所有业务表都启用 RLS；即使未来误暴露数据库接口，用户也只能读取自己的数据。

## API 合同

### Worker API

- `GET /api/worker/context`
  - 输入：设备 Bearer Token。
  - 输出：`source_cursor`、`state_version`、学习项摘要、待批改作答、当天配置。

- `POST /api/worker/sync`
  - 输入：`state_version`、幂等 `request_id`、来源消息、证据、学习项变更、同步游标。
  - 行为：事务写入；重复 `request_id` 返回原结果；版本冲突返回 `409`。

- `POST /api/worker/review`
  - 输入：日期、选中的项目、完整复习内容、`audio_script_json`、仅展示状态。
  - 行为：同一用户同一上海日期只允许一份完整复习；重复请求返回既有复习。

- `POST /api/worker/grade`
  - 输入：待批改作答 ID、批改结果、间隔复习状态变更。
  - 行为：原子保存反馈并更新 `attempts`、`correct`、`next_due` 和 `status`。

### 网页 API

- `GET /api/me/dashboard`：同步状态、今日复习概览。
- `GET /api/reviews/:date`：复习内容和音频脚本。
- `POST /api/review-attempts`：提交文字作答；只入队，绝不自行标记答对。
- `GET /api/learning-items`：学习项、来源证据和筛选。

## 身份与安全

- 用户身份：Supabase Auth 邮箱魔法链接。
- Worker 身份：首次绑定时生成一次性设备令牌；服务端只保存其哈希。令牌只保存在本机系统凭据/受限配置中。
- API：Worker 请求必须携带 `device_id`、Bearer Token、`request_id` 与版本号；写入接口有速率限制。
- 密钥：Supabase `service_role` 只存在 Vercel 环境变量；绝不进入浏览器、本机 Worker payload 或 Git。
- 隐私：原始聊天只保存与英语学习相关的最小必要文本；网页提供删除账户/学习记录入口。

## 数据与状态策略

- 云端数据库是唯一事实来源。
- 每条来源消息保留 `external_id + updated_at + content_hash`，保证增量和去重。
- 每个学习项保留 `item_evidence`，可回溯到用户原句和来源聊天。
- 复习展示仅写 `last_shown`；只有 Worker 批改过的作答才能改变 `correct`。
- 远程状态有递增 `state_version`；Worker 计算前获取，提交时校验，冲突时重新拉取后计算。
- 同步失败时保留旧数据、记录 `sync_runs` 错误并在网页显示最后成功同步时间。

## 项目结构

```text
english-review/
  worker/
    fetch-context.ts        # 调用 Worker context API
    push-sync.ts            # 校验并上传同步包
    push-review.ts          # 上传每日复习与朗读脚本
    push-grade.ts           # 上传批改结果
    schemas.ts              # Zod 请求/响应 schema
  web/
    app/                    # Next.js 页面与 Route Handlers
    lib/                    # Auth、API 鉴权、Supabase 服务端客户端
    db/migrations/          # SQL 迁移与 RLS 策略
  REVIEW_SPEC.md
  ONLINE_SERVICE_DESIGN.md
```

## 实施顺序

1. 创建 Supabase 项目和 Vercel 项目；配置邮箱登录与环境变量。
2. 初始化 Next.js `web/`，完成登录和只读“同步状态”页面。
3. 写 SQL 迁移、RLS 策略和 Worker 设备绑定接口。
4. 实现 `worker/context`、`worker/sync` 和本机 Node.js 上传脚本。
5. 将当前每日自动化改为“读取远程上下文 → 本地计算 → API 推送”。
6. 完成今日复习、声音卡片、作答提交与待批改队列。
7. 实现 Worker 批改回写、历史页、失败重试和端到端验证。

## 明确不做

- OpenAI API、云端 LLM 任务、云端 TTS。
- 浏览器抓取、ChatGPT Cookie 上传或私人聊天的未授权访问。
- 网页直接访问数据库。
- 自动将未批改作答计为答对。

## 未来升级，不改 API 合同

开通 OpenAI API 后，增加一个云端生成 Worker，使用相同的 `/api/worker/*` 合同获取状态并提交结果。此时可逐步迁移每日复习生成、批改和 MP3 TTS；本机 Worker 仍保留为 ChatGPT 聊天来源的同步器。
