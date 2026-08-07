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
