const DEFAULT_ENDPOINT = "https://english-review-three.vercel.app/api/worker/push";
const endpoint = document.getElementById("endpoint");
const token = document.getElementById("token");
const status = document.getElementById("status");

chrome.storage.local.get({ endpoint: DEFAULT_ENDPOINT, token: "" }).then((settings) => {
  endpoint.value = settings.endpoint;
  token.value = settings.token;
});

document.getElementById("save").addEventListener("click", async () => {
  const nextEndpoint = endpoint.value.trim();
  const nextToken = token.value.trim();
  if (!/^https:\/\//.test(nextEndpoint) || !nextToken) {
    status.textContent = "请填写 HTTPS 上传地址和专用同步令牌。";
    return;
  }
  await chrome.storage.local.set({ endpoint: nextEndpoint, token: nextToken });
  status.textContent = "已保存。现在可在 englishTranning 中自动同步。";
});
