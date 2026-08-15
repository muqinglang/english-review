# English Review 交接说明（2026-08-15）

## 1. 用户要的最终行为（不可偏离）

用户使用个人 ChatGPT 账号，**不支持 GPT Actions**。正确链路是：

1. 用户在 `englishTranning` 普通 ChatGPT 对话中完成练习。
2. ChatGPT 仅在练习结束时输出一个最新的 ````english-review-sync` JSON 代码块。
3. Chrome 扩展只读取该代码块并上传到网站。
4. 网站先把这批题放入“对话复习”临时队列；用户还没有复习前，**绝不能进入 SRS / 历史题库**。
5. 用户在“对话复习”点“答错 / 模糊 / 答对”后，才把该题写入或更新 `learning_items`，并由 SRS 排期。
6. “旧题复习”只显示此前已评分、当前到期的题；答对仍需复习，但间隔更长。
7. 页面有三个 tab：`对话复习`、`旧题复习`、`听力跟读`。

最重要的展示规则：

- “对话复习”显示**最近一次成功同步的整批数据**，不是昨天固定日期，也不能用旧的每日复习包代替。
- 只有包含完整富内容的批次才可展示：中文核心含义、通俗解释、使用提醒、至少 3 个彼此不同的生活场景（每个场景有英文句和中文翻译）。
- 不允许为了避免空白而退回展示旧的“场景 1”单句数据。

## 2. 当前用户看到的问题

页面“对话复习”显示：`还没有成功同步的 ChatGPT 对话内容`。

此前该页面曾显示旧格式的单场景卡片；用户明确要求修正为：**必须有数据，并且必须展示多个真实场景**。后来页面改为过滤旧格式数据后变空白。当前不能宣称富内容已正确保存。

页面截图中没有黄色数据库错误提示；Vercel 日志也只显示 `/review` 的成功请求，没有查询报错。

## 3. 已确定的事实

### 用户提供的最新 JSON 是有效的

已在本地对用户提供的附件执行 `JSON.parse` 验证。该批 JSON：

- `space: "English Review"`
- `practiceDate: "2026-08-15"`
- 共 8 个学习项
- 每个 `example` 是 JSON 对象（不是字符串）
- 每个 `example.examples` 有 3 个场景；例如第 1 项有“朋友出行 / 工作 / 家庭”，`spot issues` 有“工作 / 视频制作 / 购物”。

因此，**源 JSON 本身不是空白和单场景的原因**。

### Chrome 扩展

目录：`chrome-extension/`，目前 manifest 版本为 `1.0.4`。

扩展逻辑：

- 从 ChatGPT 页面最新的 `english-review-sync` 代码块开始反向扫描；
- 忽略旧的无效代码块；
- 直接 JSON 解析失败时，提取最外层 `{...}` 后再解析；
- 用户曾确认 1.0.4 版本“同步成功”。

不要恢复 GPT Actions，不要尝试爬取用户私人 ChatGPT 项目/聊天记录。

### 服务端保存路径

入口：`web/src/app/api/worker/push/route.ts`。

该路由接受 `example` 的两种格式：

- 旧格式：纯文本字符串；
- 新格式：富内容对象。

新格式由 `normalizeExample()` 校验，并以 `JSON.stringify()` 保存到 `practice_items.example`。校验要求 `meaning`、`explanation`、`usageTip` 和 3–8 个完整场景例句。

表和迁移：`web/supabase/migrations/0009_conversation_review_pipeline.sql`。

- `practice_sessions`：同步批次；没有 `created_at` 列。
- `practice_items`：批次题目，拥有 `created_at`。
- `practice_attempts`：对话复习的自评记录。

### 当前页面筛选逻辑

文件：`web/src/app/review/page.tsx`。

当前查询读取：

```ts
practice_items
  .select("id,created_at,normalized_key,cue,answer,example,practice_sessions!inner(id,knowledge_space_id,practice_date),practice_attempts(id)")
  .eq("user_id", user.id)
  .order("created_at", { ascending: false })
  .limit(100)
```

然后只保留：

```ts
!item.practice_attempts?.length && hasCompleteConversationExamples(item.example)
```

其中 `hasCompleteConversationExamples()` 要求 `example` 可解析为 JSON，且 `examples.length >= 3`。

因此空白的直接原因是：当前登录用户查出的记录中，**没有任何一条同时满足“未评分 + 富 JSON + 3 场景”**。但尚未查明它属于以下哪种情况：

1. 富 JSON 没有写进数据库；
2. 写入到了另一个用户 ID；
3. 写入了，但被标为已自评；
4. 写入了不同 session / knowledge space，或 relation/query 形状造成漏读；
5. 部署版本与实际别名不一致。

## 4. 不要相信的旧结论

此前曾有“数据库已核对 8 items、页面应显示”的结论，但它与当前实际页面空白相冲突，**不能作为已验证事实使用**。请直接查询生产 Supabase 后重新判断。

此前还发生过一个已知错误：页面错误请求 `practice_sessions.created_at`，但该列不存在，Vercel 报错 `42703`。现页面已改为使用 `practice_items.created_at`；当前截图没有该查询错误。

## 5. 建议的只读排查顺序

先不要再改 UI 或回退为单场景卡片。先在生产 Supabase SQL Editor（或服务端安全环境）执行只读查询。

### A. 找到当前用户的 ID

```sql
select id, email
from auth.users
where email = '<当前登录邮箱>';
```

### B. 查看该用户的所有对话同步批次和题目

```sql
select
  ps.id as session_id,
  ps.user_id,
  ps.practice_date,
  ps.source,
  ps.payload_hash,
  ps.item_count,
  pi.id as item_id,
  pi.created_at as item_created_at,
  pi.normalized_key,
  left(pi.example, 160) as example_prefix,
  jsonb_array_length(
    case
      when left(ltrim(coalesce(pi.example, '')), 1) = '{'
        then (pi.example::jsonb -> 'examples')
      else '[]'::jsonb
    end
  ) as scenario_count,
  count(pa.id) as attempt_count
from public.practice_sessions ps
join public.practice_items pi on pi.practice_session_id = ps.id
left join public.practice_attempts pa on pa.practice_item_id = pi.id
where ps.user_id = '<用户 UUID>'
group by ps.id, pi.id
order by pi.created_at desc;
```

若 `example::jsonb` 可能有历史坏数据，先不用强制转换，改为查询 `example_prefix`，单独定位具体记录后再解析。

### C. 确认 worker token 属于哪个用户

上传接口依赖 Worker token。若 B 中无 2026-08-15 富批次，重点检查 Chrome 扩展所用 token 对应的 `worker_devices.user_id` 是否就是 A 中的用户。

```sql
select id, user_id, display_name, last_seen_at, revoked_at
from public.worker_devices
order by created_at desc;
```

### D. 观察上传接口实际响应 / 日志

检查 `POST /api/worker/push` 在用户点击/刷新 ChatGPT 时的生产日志。应记录安全的计数、用户 ID（可只保留前缀）、session ID、accepted 数和 rich item 数；**不要记录 API key、Worker token 或完整学习内容**。

建议把成功响应扩展为：

```json
{
  "ok": true,
  "accepted": 8,
  "practiceSessionId": "...",
  "richItemCount": 8
}
```

Chrome 扩展只有收到此响应后才显示“已自动保存 8 个复习项”。

## 6. 当前未完成的只读诊断代码

`web/src/app/review/page.tsx` 已临时加入 `console.info("Conversation review diagnostics", ...)`，记录：

- 当前用户查到的 practice item 总数；
- 3 场景富记录数；
- 未评分数；
- 每项的 session ID、practice date、key、场景数、example 格式和 attempt 数。

该代码不写数据，但需要用户刷新 `/review` 后再从 Vercel 日志读取。生产诊断部署是：

`dpl_Cd8bTwDq5zXQzJfQrWLovZcLQ9XR`

后续有一次新的部署命令被用户中断，**不能假定它已完成或已指向正式域名**。先在 Vercel Dashboard 确认 `english-review-three.vercel.app` 当前绑定部署，再根据上述 SQL 排查；根因修复后应删除或降级该临时诊断日志，避免长期记录学习项 key。

## 7. 语音状态（另一个独立问题）

用户截图中 Fish Audio 和 ElevenLabs 显示“已连接”，但用户说自己没有配置 key。

真实含义不是“连接或验证成功”：代码里的 `configured: true` 只表示 `integration_credentials` 表中存在该 `user_id + provider` 的一行。截图还显示 Fish 的已保存密钥末尾 `0CTm`，所以数据库确实有一条加密凭据记录，但不应据此说密钥有效、也不能推断用户刚刚配置过。

语音相关文件：

- `web/src/lib/fish-audio.ts`
- `web/src/lib/elevenlabs.ts`
- `web/src/app/api/tts/route.ts`
- `web/src/components/fish-audio-panel.tsx`
- `web/src/components/elevenlabs-panel.tsx`
- `web/src/components/voice-provider-preference.tsx`

正确 UX：显示“已保存凭据 / 未配置”，而不是“已连接”。仅在用户点击“测试语音”且上游返回音频时，才可显示“验证成功”。不要自动删除现有凭据；先让用户明确选择删除。

本地工作区中已开始把文字改为“已保存凭据”，并为 Fish 添加“删除凭据”按钮；用户随后要求停止，且部署命令中断。请先审查差异，再决定保留、还原或重新实现。

## 8. 工作区与发布状态

仓库：`D:\codex\english-review`

当前 `git status` 有大量未提交改动，包含用户已有及此前开发中的修改；不要使用 `git reset --hard` 或覆盖整个工作区。

最近一次已提交 commit：

```text
ed52f61 Improve listening dictation practice
```

主要未提交文件包括：

- `web/src/app/review/page.tsx`
- `web/src/app/api/worker/push/route.ts`
- `chrome-extension/`
- `web/supabase/migrations/0009_conversation_review_pipeline.sql`
- Fish / ElevenLabs 相关组件与 API 路由。

请先用 `git diff`、`git status` 审核，而不要假定所有改动都是正确或已上线。

## 9. 安全边界

- 不读取、爬取或自动登录用户的私人 ChatGPT 项目。
- Chrome 扩展只处理用户当前打开页面内、明确标记的 `english-review-sync` 代码块。
- API key 不得输出到日志、聊天、前端状态或交接文档。
- `integration_credentials` 中保存的是用户级加密密文；是否有一行记录与密钥是否有效是两件事。
- 自动化 worker 不能在云端读取 ChatGPT 对话；它只能处理已经上传的网站数据。

## 10. 验收条件

完成修复前，请逐项验证：

1. 用一份含 8 个富场景题目的真实 JSON 上传，接口响应 `accepted=8` 且 `richItemCount=8`；
2. 在**同一个登录用户**下，Supabase 可查到同一个 session 的 8 个 `practice_items`，每项 JSON `examples` 至少 3 条；
3. 刷新页面后，“对话复习”显示这一个最新同步批次的 8 张卡，每张渲染 3 个不同场景；
4. 不显示旧的单场景题，不用历史每日包替代；
5. 在用户点击答错/模糊/答对前，`learning_items` 不新增或变更；
6. 点击一次自评后，只有这一项进入 / 更新 SRS；
7. Fish / ElevenLabs 状态只显示“已保存凭据”，测试成功后才显示验证结果。
