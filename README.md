# English Review

个人英语复习服务的代码仓库。

第一期采用“本机 Worker 主动推送 + 线上回顾网站”模式：继续在 ChatGPT 中聊天，本机 Worker 通过远程 API 推送学习数据，网站提供登录、复习、声音卡片和历史回顾。

架构与技术方案见：

- [线上服务设计](ONLINE_SERVICE_DESIGN.md)
- [第一期技术方案](TECHNICAL_PLAN_V1.md)

本仓库不会提交个人学习总账、每日复习文件、浏览器 Cookie 或任何密钥。

## 配置本机 Worker 令牌

运行以下脚本并在隐藏输入中粘贴一次性 Worker 令牌。令牌使用 Windows
当前账户加密保存，不会进入命令历史，加密文件也已被 Git 忽略。

```powershell
.\worker\configure-token.ps1
```

之后推送数据时无需再把令牌写到命令行：

```powershell
.\worker\push-items.ps1 -ItemsFile .\worker\example-items.json
```

## 把新学习内容加入次日复习

将整理好的学习项保存为 `inbox/*.json`，格式见
[`inbox/README.md`](inbox/README.md)，然后运行：

```powershell
.\worker\import-inbox.ps1 -Verbose
.\worker\pull-review-state.ps1 -Verbose
```

入库成功的新项目会在 `capturedOn` 的次日首次到期。成功处理的文件会移动到
`inbox/processed/`，失败文件会原样保留，避免静默丢失学习内容。网站也提供“新增学习内容”入口，适合不方便创建 JSON 时使用。

每个学习项只保存一个可独立评分的知识点。不要写成 `one size doesn't fit all; nudge; willpower`，也不要用斜杠合并多个词；应拆成 3 个项目，让每个项目拥有自己的稳定标识和复习排期。每日答案会为每题提供中文核心含义、通俗解释、至少 3 个不同生活场景的英中例句，以及易混或使用提示。

## ChatGPT English Tranning 自动同步

个人 ChatGPT 账号无法创建新的 GPT Action 时，可使用本地 Chrome 扩展保留原有的
`englishTranning` 练习体验。练习结束后，项目指令让 ChatGPT 输出一个结构化同步标记；扩展只提取该标记中的原子学习项并自动上传，不上传完整聊天记录。

安装、权限说明和项目指令见 [chrome-extension/README.md](chrome-extension/README.md)。

结构化丰富答案建议让 `answer` 只保存简洁核心答案，把 `meaning`、`explanation`、`usageTip` 和至少 3 个 `{scenario, english, chinese}` 场景序列化为单行 `example` JSON 字符串；旧的纯文本 `example` 仍然兼容。完整示例见 [`inbox/README.md`](inbox/README.md)。

推送每天完整的文字复习与听力卡片：

```powershell
.\worker\push-daily-review.ps1 `
  -MarkdownFile .\reviews\2026-08-07.md `
  -AudioFile .\reviews\2026-08-07.audio.json
```
