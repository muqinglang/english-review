# English Review — 每日个性化复习规范

## 目标

- 练习仍可在 ChatGPT 项目 `englishTranning` 中进行，但每日任务不再尝试直接抓取另一个私人项目。可靠来源只有两种：登录网站的 `/capture`“添加学习内容”入口，以及本地 `inbox/*.json` 文件。两种入口都必须记录实际学习日期，并在次日首次到期。
- 用户水平：B1；每天 8–12 分钟。
- 每次定时运行必须把完整复习内容显示在本次任务的最终回复里，同时归档到 `reviews/YYYY-MM-DD.md`。
- 一道题只考一个可独立判断“答错 / 模糊 / 答对”的知识点。不同单词、短语、语法点或用法边界必须拆成不同学习项；禁止用分号、斜杠、顿号或并列清单把多个独立词汇塞进同一道题。像 `one size doesn't fit all; nudge; willpower` 这样的内容必须拆成 3 题，并分别拥有稳定 `id`、`normalized_key` 和独立排期。只有一个不可再拆的固定搭配或完整语法结构可以作为一个学习项。
- 学习项的 `answer` 只保存简洁核心答案，不把解释、多个例句或多个词汇拼进去。`ledger.json` 中推荐把丰富答案保存为单行 `example` JSON 字符串，结构固定为 `{"meaning":...,"explanation":...,"usageTip":...,"examples":[{"scenario":...,"english":...,"chinese":...}]}`；`examples` 至少包含 3 个不同生活场景。旧的纯文本 `example` 仍兼容，生成时必须补全通俗解释、使用提示和至少 3 个不同生活场景的英中例句。
- 同时生成 `reviews/YYYY-MM-DD.audio.json`，供本地声音卡片播放页和线上听力卡片使用。每张卡必须使用 `id`、`prompt`、`normal` 字段，可选 `slow` 字段；禁止使用 `text` 代替 `normal`。`id` 必须精确复用唯一一个 `ledger.json` 学习项的稳定 `id`，不得按日期或措辞另造近义 ID；一张卡只对应一个学习项。`id`、`prompt`、`normal` 都必须是非空字符串。`prompt` 是简短练习提示，`normal` 和 `slow` 只写需要朗读的自然英文答案/例句，不写中文解释、IPA 或语法分析；为连读题同时提供慢速分块文本和正常语速文本。
- 原 ChatGPT 项目保存原始口语练习；本目录只保存整理后的生词、地道表达、常犯错误、听力难点和复习状态。
- 用户在网站上的自评及云端排期是复习状态的事实源；`ledger.json` 是 Worker 的本地镜像，生成前必须先从云端合并状态，禁止用陈旧的本地日期覆盖云端排期。
- 迁移边界：`2026-08-07` 至 `2026-08-10` 的旧复习使用过不稳定的临时卡片 ID，只保留为 Markdown/旧音频历史，不参与评分，也不得用新脚本重推或猜测关联；结构化 SRS 从 ID 已校正的 `2026-08-11` 开始。

## 每次运行流程

1. 使用 `Asia/Shanghai` 的当前日期，从 `english-review` 目录先执行 `./worker/import-inbox.ps1 -Verbose`。只有返回 `ok = true` 才可继续；记录 `receivedCount` 和 `processedFiles`。没有待处理文件时 `receivedCount = 0` 是正常结果；文件格式或上传失败时停止本次生成，原文件必须留在 `inbox/`，不得静默跳过。
2. 执行 `./worker/pull-review-state.ps1 -Verbose`，把云端的 `attempts`、`correct`、`review_stage`、`correct_streak`、`last_result`、`learned_on`、`next_due`、`last_shown` 和作答时间按 `normalized_key` 合并到 `ledger.json`。云端存在、本地不存在的学习项必须追加到本地台账，稳定本地 `id` 使用 `web-<云端学习项 UUID>`，并标记 `source_kind = web_capture`。同一 `normalized_key` 已存在时：`source_kind = web_capture`（或稳定 ID 以 `web-` 开头）的项目以云端为内容事实源，同步 `type`、`cue`、`answer`、`example`、`priority` 和 `occurrences`；其他本地来源只合并排期字段及缺失的云端标识，不覆盖本地内容。拉取失败时不得继续生成一份可能重复的复习；保留本地文件并明确报告同步错误。
3. 完整读取本文件和刚同步的 `ledger.json`。在 Windows PowerShell 中读取这两个 UTF-8 文件时显式使用 `-Encoding UTF8`。不得根据记忆编造来源内容，也不得把“尝试读取 ChatGPT 项目”写成已完成同步；其他聊天中新学到的内容必须先通过 `/capture` 或符合 `inbox/README.md` 的 UTF-8 JSON 显式入库。
   - 选题前检查学习项是否为可评分的原子知识点。如果 `cue`、`answer` 或 `normalized_key` 用分号、斜杠、顿号或并列清单合并了多个独立词汇，不得照原样出成一道题；必须先拆成多个学习项，每项使用稳定且互不相同的 `id` 与 `normalized_key`，再分别排期和生成卡片。不得让拆分后的项目共用一个评分按钮或复习状态。
   - 为帮助理解而新写的生活场景例句属于教学扩展，可以生成，但必须忠于原知识点的含义和用法，不得虚构为用户说过的话或来源记录。
   - 新建或拆分学习项时，`answer` 只写简洁核心答案；丰富答案优先按以下结构序列化为 `ledger.json` 中的单行 `example` 字符串。已有纯文本 `example` 不要求迁移失败，也不得因此丢弃原内容：

     ```json
     {
       "answer": "简洁核心答案",
       "example": "{\"meaning\":\"中文核心含义\",\"explanation\":\"通俗中文解释\",\"usageTip\":\"易混表达或使用提醒\",\"examples\":[{\"scenario\":\"工作沟通\",\"english\":\"Natural English sentence.\",\"chinese\":\"对应中文翻译。\"},{\"scenario\":\"家庭生活\",\"english\":\"Natural English sentence.\",\"chinese\":\"对应中文翻译。\"},{\"scenario\":\"朋友交流\",\"english\":\"Natural English sentence.\",\"chinese\":\"对应中文翻译。\"}]}"
     }
     ```
4. 只有 `next_due <= 今天` 且 `last_shown < 今天`（或从未展示）的项目可以进入今天的题目；今天已经生成过的项目不得在同一天重复生成。总数最多 10，严格按以下顺序取题：
   - 第一优先：`pending_answer = true` 的到期项，即已经展示、但在该次展示后尚未自评的项目；优先保留昨天展示的项目，确保前一天首次学习的内容次日进入复习。
   - 第二优先：已有自评记录的其他到期项。
   - 第三优先：从未展示但已经到期的新项目，最多 2 个。
   到期项不足时宁可少出题或显示“今天没有更多到期项”，不得使用 `next_due > 今天` 的项目凑数。知识点拆分后如果超过 10 题，不得为了满足上限重新合并独立知识点；应按上述优先级保留前 10 题，把低优先级项目延后到下一次符合排期的复习。`pending_answer` 的等价判定为：`last_shown` 存在，并且 `last_answered_at` 为空或其上海日期早于 `last_shown`。
5. 新项目入库时已经把 `next_due` 设为 `learned_on + 1`，所以它从次日开始可选。展示只把 `last_shown` 记为今天，不得改变 `next_due`，也不得增加 `attempts`、`correct` 或算作答对。项目展示后仍未自评时，原到期日保持不变，因此从第二天起仍会每天进入第一优先队列，直到用户在网站上选择“答错 / 模糊 / 答对”。不存在 3 天冷却，也不会再次跳过昨天的新内容；只有网站自评接口可以按 1/3/7/30/90 天规则推进排期或标记掌握。
6. 生成后保存 `reviews/YYYY-MM-DD.md` 和同日期 `.audio.json`，并更新 `ledger.json` 的 `last_generated_date`、所选项目的 `last_shown`，不得因生成或重复展示改写 `next_due`。保存后重新读取并校验音频 JSON：必须能解析、至少有一张卡；每张卡的 `id`、`prompt`、`normal` 都是非空字符串、`id` 唯一且能在 ledger 中精确找到；卡片顺序就是本次学习项顺序。当天文件已存在且完整时，直接展示，避免重复生成，但仍必须执行下一步线上推送。
7. 从 `english-review` 目录执行以下命令，把当天复习、结构化学习项及一一对应关系推送到线上网站：

   ```powershell
   .\worker\push-daily-review.ps1 `
     -MarkdownFile ".\reviews\YYYY-MM-DD.md" `
     -AudioFile ".\reviews\YYYY-MM-DD.audio.json" `
     -ReviewDate "YYYY-MM-DD" `
     -Verbose
   ```

   必须检查命令返回对象中的 `ok` 和 `reviewSaved` 都为 `true`、`accepted` 等于本次卡片数、`reviewDate` 等于当天日期且 `reviewId` 非空，才能在最终回复中声明网站已更新。线上接口按日期幂等更新，所以当天文件已存在时也要重新推送。推送失败时，先重新校验文件并重试一次；仍失败则保留本地归档，在最终回复开头明确写“线上推送失败”及实际错误，不得静默完成或声称网站已更新。
8. 最终回复除完整复习内容外，还必须报告 `inbox receivedCount`、云端 `inserted/merged` 和网站 `reviewSaved/reviewDate`。这样即使当天没有新来源，也能明确区分“没有入库内容”和“来源同步失败”。

## 每日输出结构

不要使用表格。按以下顺序输出：

1. `☀️ 今日口语复习｜YYYY-MM-DD`
2. `先别看答案`：
   - 3–4 个中译英或释义回忆题
   - 2 个原句纠错题
   - 1 个听力/连读辨音题
3. `地道表达替换`：给 1–2 个中文意图，让用户口头说英语。
4. `口语挑战`：一个 30–60 秒、与用户真实经历相关的话题，要求至少使用 2 个今日复习项。
5. `答案与提示`：与题目一一对应，每题必须依次包含：
   - `中文核心含义`：一句话给出最重要、最可记忆的中文含义。
   - `通俗解释`：用简单中文解释何时使用、语气和使用边界；不能只重复中文同义词。
   - `生活场景例句`：至少 3 个彼此不同的真实生活场景，例如工作沟通、家庭生活、购物出行、学习健身或朋友交流。每个场景都必须给自然英文句子和对应中文翻译；不得只把同一句替换主语。
   - `易混 / 使用提示`：指出一个常见误用、易混表达或不适用场景；没有直接近义词时也要给出简短使用提醒。
   对纠错题还要明确区分“错误”与“没错但可更自然”。
6. `今天最值得记住的一件事`：只保留一条。

## 纠错和间隔复习规则

- 优先纠正会影响理解、重复出现或可迁移性强的问题；一次最多精讲 3 类错误。
- 网站只在用户揭晓答案后接受一次计入排期的自评：`答错 (incorrect)`、`模糊 (partial)`、`答对 (correct)`。重复点击必须幂等，不能二次推进排期。
- 答错：阶段重置为 0，次日复习；模糊：阶段降低一级（最低 0），3 天后复习；答对：阶段依次推进到 1、2、3，对应 7、30、90 天后复习。到达阶段 3 后标记为 `mastered`，但到期时仍可复习。
- 每次自评都增加 `attempts`，只有答对增加 `correct`；揭晓答案本身不算作答，也不改变排期。
- 相同含义的词要讲清使用边界，不只给中文同义词。
- 问词义时使用四步法：中文核心含义 → 通俗使用解释 → 至少 3 个不同生活场景的英中例句 → 易混/使用提示。
- 一题只能有一个评分对象。若答案中需要比较近义词，被比较词只能作为“易混/使用提示”，不能与主词一起成为并列考点；需要单独掌握时必须另建稳定学习项并独立排期。
- `comment` 是代码注释；`comment out` 是把代码注释掉使其不执行；`noted` 是“知道了/已记下”。

## 当前重点

- `insist on` 与 `persist in`
- `resist`、`reject` 与 `push back against`
- `What does X mean?` 的问句结构
- `repeat again` 的冗余
- 双主语、缺少 `be`、第三人称单数
- 名词/形容词混用
- `was about to` 与 `hit you` 的弱读、连读和合音
