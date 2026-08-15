# English Tranning 自动同步扩展

这个本地 Chrome 扩展只处理 ChatGPT 页面中由 `englishTranning` 项目指令明确生成的 `english-review-sync` JSON 代码块。它不会上传整段聊天记录，也不会读取或上传密码、Cookie 或其他浏览器数据。

## 安装

1. 打开 Chrome：`chrome://extensions`。
2. 打开右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本文件夹 `chrome-extension`。
4. 在扩展详情中点击“扩展程序选项”。
5. 在 English Review 网站设置页生成新 Worker 设备，名称填写 `English Tranning Chrome Sync`；将只显示一次的令牌粘贴进选项页并保存。
6. 将 `ENGLISH_TRANNING_PROJECT_INSTRUCTIONS.md` 中的文字复制到 ChatGPT 的 `englishTranning` 项目指令。

## 使用

在 `englishTranning` 完成练习后说“结束练习”。ChatGPT 输出同步代码块时，扩展自动上传其中的原子学习项，并在右下角显示成功或失败提示。

## 安全边界

- 令牌保存在 Chrome 扩展本地存储，永远不会出现在 ChatGPT 回复、项目指令或 Git 中。
- 扩展仅请求 `chatgpt.com` 页面和 English Review 上传接口的访问权限。
- 它只解析明确的 `english-review-sync` 代码块，不上传完整聊天内容。
- 可随时在 English Review 设置页撤销 `English Tranning Chrome Sync` 设备令牌。
