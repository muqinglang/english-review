# 英语复习线上服务｜第一期设计

技术选型、组件职责、API 合同与实施顺序见 [TECHNICAL_PLAN_V1.md](TECHNICAL_PLAN_V1.md)。

## 目标

继续将 ChatGPT 中的 `englishTranning` 项目作为日常对话入口。本机中已获授权的 Worker 按提示词与脚本增量处理聊天内容，并只通过远程 API 读取状态、提交计算结果和写入数据；远程服务负责持久化存储、复习状态、音频资源和需要登录才能访问的复习网站。

## 不做什么

- 不重做聊天界面。
- 不爬取 ChatGPT 网页，也不将 ChatGPT 浏览器 Cookie 保存到远程。
- 本机 Worker 未同步时，不把云端数据伪装成最新数据。

## 总体架构

```text
ChatGPT 项目
  -> 本机 Worker（提示词 + 脚本：增量读取、提取、评分、生成）
  <-> HTTPS 业务 API
  <-> Postgres 数据库 + 对象存储
  -> 需登录的网页（复习、音频、历史、作答）
```

## 部署建议

- 网页与 API：部署在 Vercel 的 Next.js。
- 登录、Postgres、行级安全策略和对象存储：Supabase。
- 定时任务：Vercel Cron 调用经过鉴权的服务端路由。
- AI 生成与 TTS：只在服务端调用 OpenAI API；浏览器不保存任何密钥。
- 本机 Worker：第一期沿用当前 Codex 自动化；第二期改为轻量桌面后台程序。

## 第一期运行模式：Worker 主动推送（不使用 OpenAI API Key）

第一期不让云端读取 ChatGPT，也不让云端调用 AI 生成内容。每次本机 Worker 按既定提示词和脚本运行时，在现有登录授权下完成以下工作：

1. 通过 `GET` API 取得该设备的同步游标、远程学习状态和当天任务配置。
2. 增量读取 `englishTranning` 中可读取的新聊天内容。
3. 按当前复习规范提取学习项；根据远程返回的数据计算去重、优先级、间隔复习评分和当天选题。
4. 通过 `POST` API 提交原始学习证据、评分结果、学习总账变更、复习内容和纯英文音频脚本。
5. 接收服务端确认的版本号/游标；确认后才更新本地同步状态。

Worker 不直接读写远程数据库，也不以本地文件作为云端事实来源。远程 API 是唯一的数据交互边界；本地文件仅可作为运行缓存和失败重试队列。

因此，这一期不需要 OpenAI API Key，也不会使用网页抓取或远程保存 ChatGPT Cookie。仍需要一个远程服务的设备密钥，用于让本机 Worker 安全调用自己的接收 API；它不是 OpenAI 密钥。

边界是：电脑关机、Codex 未运行或读取能力不可用时，云端只能展示最近一次成功同步的数据和明确的同步时间。等后续需要“电脑关闭后仍由云端自动生成”时，再单独启用 OpenAI API。

## 来源与同步约定

1. Worker 先从 API 获取来源游标、数据版本和任务配置，再只读取来源游标之后新增或更新的消息。
2. Worker 提交不可变的 `source_message` 记录，包含来源项目/聊天 ID、消息 ID、角色、时间、原文、更新时间和内容哈希。
3. 服务端以 `(user_id, source_message_id, updated_at)` 作为幂等键，重复提交不会产生重复数据。
4. Worker 基于 API 返回的远程项目状态完成评分与选题；服务端再校验版本号，避免并发覆盖。
5. 只有服务端确认全部分页数据写入成功后，Worker 才更新本地游标。
6. 每次同步都创建一条 `sync_run` 记录：开始/结束时间、状态、输入/输出游标、接收数量和错误摘要。
7. 网页展示 `last_successful_sync_at`；同步失败或过期必须有明显标记。

## 数据库模型

### 身份与来源

- `profiles(id, timezone, created_at)`
- `sources(id, user_id, provider, project_ref, display_name, cursor, last_successful_sync_at)`
- `source_chats(id, source_id, external_id, title, updated_at)`
- `source_messages(id, source_chat_id, external_id, role, original_text, occurred_at, updated_at, content_hash)`
- `sync_runs(id, source_id, started_at, finished_at, status, received_count, error_summary)`

### 学习总账

- `learning_items(id, user_id, normalized_key, type, cue, answer, example, priority, status, occurrences, attempts, correct, next_due, last_shown)`
- `item_evidence(id, learning_item_id, source_message_id, original_sentence, evidence_kind)`
- `pending_confirmations(id, user_id, source_message_id, raw_text, suggested_interpretation, status)`

每位用户的 `normalized_key` 唯一。已确认的语法错误、词汇和发音问题属于不同类型；疑似语音转写乱码只能写入 `pending_confirmations`，不能算作错误。

### 复习与作答

- `reviews(id, user_id, review_date, status, content_json, audio_script_json, created_at)`
- `review_items(id, review_id, learning_item_id, position, shown_at)`
- `review_attempts(id, review_item_id, submitted_text, result, feedback_json, answered_at)`
- `audio_assets(id, review_id, card_key, speed, storage_path, status)`

## API 边界

- `POST /api/ingest/sync`：Worker 鉴权的批量幂等写入；返回已接收记录和下一个游标。
- `GET /api/worker/context`：返回 Worker 所需的同步游标、学习项摘要、远程数据版本和当天任务配置。
- `POST /api/worker/compute-result`：提交 Worker 基于远程上下文计算出的项目评分、选题、复习与音频脚本；服务端校验数据版本后原子写入。
- `GET /api/sync-status`：返回当前登录用户最近一次成功/失败的同步状态。
- `GET /api/reviews/today`：返回当天复习和可播放的音频地址。
- `POST /api/reviews/{id}/attempts`：提交答案；批改并在同一事务内更新间隔复习状态。
- `GET /api/learning-items`：查看学习历史和筛选结果。

Worker 使用只保存在本机的设备密钥。网页用户通过普通登录访问；浏览器会话永远拿不到 Worker 密钥或 AI 服务商密钥。

## 后台任务

### 同步 Worker

电脑开机期间每 30–60 分钟运行一次，并提供“立即同步”操作。它不负责生成复习，只发送经过校验的增量数据。

### 每日本机 Worker 任务（第一期）

在可配置的 Asia/Shanghai 时间执行：

1. 优先读取到期项，其次选择高频错误、低正确率和长时间未出现的项目。
2. 选择 6–9 个项目，每天最多引入 2 个新项目。
3. 生成 B1 难度、8–12 分钟的主动回忆复习，以及独立的纯英文朗读脚本。
4. 生成或复用正常语速与慢速音频。
5. 仅更新 `last_shown`；用户提交答案前，绝不标记为答对。

第一期由本机 Worker 执行并推送结果；后续启用 OpenAI API 后，才可迁移为完全云端的每日任务。

### 作答处理任务

每次用户提交答案时，保存原始作答；最多讲解 3 类可迁移的关键错误；随后在同一事务内更新 `attempts`、`correct`、`next_due` 与 `status`。

## 首发版本范围

1. 邮箱魔法链接登录。
2. 支持幂等写入并展示同步状态的 Worker 接收 API。
3. 延续现有声音卡片行为的每日复习页面。
4. 文本作答提交与间隔复习状态更新。
5. 复习历史和学习项证据查看页面。

第一期不包含：录音上传、发音自动评分、推送通知、多用户共享、从私人 ChatGPT 项目直接由云端自动读取聊天记录，以及云端 OpenAI API 调用。

## 验收条件

- 重复执行同步不会重复创建消息、证据或学习项目。
- 同步失败时保留既有云端复习，并将来源标记为过期。
- 每个上海日期最多生成一份当日复习。
- 仅浏览复习不会增加 `correct`。
- 每个学习项目都可以追溯到用户的原始句子。
