# 学习内容收件箱

这里用于把其他聊天或手工整理的学习内容可靠地交给每日复习任务。
除本说明外，`inbox/` 中的文件都不会提交到 Git。

每个待处理文件使用 UTF-8 JSON，格式如下：

```json
{
  "version": 1,
  "space": "English Review",
  "capturedOn": "2026-08-11",
  "items": [
    {
      "type": "vocabulary",
      "normalizedKey": "carve out time",
      "cue": "如何表达‘专门抽出时间’？",
      "answer": "carve out time",
      "example": "I carve out thirty minutes for English every evening.",
      "priority": "high",
      "occurrences": 1
    }
  ]
}
```

- `type` 可以是 `vocabulary`、`expression`、`error`、`pronunciation`、`fact`、`concept`、`decision` 或 `quote`。
- `normalizedKey` 可省略；省略时脚本会根据类型与题目生成稳定键。它只用于新建或识别项目；Worker 对已有项目同步时不会覆盖云端的复习计数。
- `capturedOn` 是实际学到内容的上海日期。新项目会在次日首次到期。
- `items` 中的每个对象只能表示一个可独立评分的知识点，并拥有自己的稳定 `normalizedKey`。禁止在 `cue`、`answer` 或 `normalizedKey` 中用分号、斜杠、顿号或并列清单合并多个独立单词、短语或语法点；复合内容必须拆成多个对象，分别入库和排期。
- `answer` 只保存简洁核心答案，不要把解释、多个词或例句拼入该字段。
- 推荐把 `example` 写成单行 JSON 字符串，固定包含 `meaning`、`explanation`、`usageTip` 和 `examples`。`examples` 至少有 3 个不同生活场景，每项包含 `scenario`、`english`、`chinese`。旧的纯文本 `example` 仍兼容；每日复习会在不改变原义的前提下补全丰富答案。

  ```json
  "answer": "nudge",
  "example": "{\"meaning\":\"温和提醒或推动\",\"explanation\":\"轻轻推动别人采取行动，不是命令。\",\"usageTip\":\"语气通常比 push 温和。\",\"examples\":[{\"scenario\":\"工作沟通\",\"english\":\"I gave my teammate a gentle nudge about the deadline.\",\"chinese\":\"我温和地提醒了同事截止日期。\"},{\"scenario\":\"家庭生活\",\"english\":\"The note on the fridge nudged me to buy milk.\",\"chinese\":\"冰箱上的便条提醒我去买牛奶。\"},{\"scenario\":\"健康习惯\",\"english\":\"My watch nudges me to stand up every hour.\",\"chinese\":\"我的手表每小时提醒我站起来活动。\"}]}"
  ```
- 成功入库的文件会移动到 `inbox/processed/`；失败文件保留原位，方便修正后重试。

手动处理：

```powershell
.\worker\import-inbox.ps1 -Verbose
```
