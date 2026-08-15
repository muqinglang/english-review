const DEFAULT_ENDPOINT = "https://english-review-three.vercel.app/api/worker/push";
const storage = chrome.storage.local;

function clean(value, maximum) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= maximum ? result : null;
}

function isDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validItem(item) {
  if (!item || typeof item !== "object") return false;
  const key = clean(item.normalizedKey, 240);
  const cue = clean(item.cue, 20000);
  const answer = clean(item.answer, 50000);
  // Only the identity key must stay a single knowledge point; cue/answer prose may
  // legitimately contain a slash (e.g. a Chinese gloss like "积分/额度").
  if (!key || !cue || !answer || /[;；/、]/.test(key)) return false;
  return ["vocabulary", "expression", "grammar", "error", "pronunciation"].includes(item.type);
}

function validPayload(payload) {
  if (!payload || typeof payload !== "object" || payload.space !== "English Review" || !isDate(payload.practiceDate)) return false;
  if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 20) return false;
  const keys = new Set();
  return payload.items.every((item) => {
    if (!validItem(item) || keys.has(item.normalizedKey)) return false;
    keys.add(item.normalizedKey);
    return true;
  });
}

async function savePractice(payload) {
  if (!validPayload(payload)) throw new Error("同步内容格式无效：每项必须是一个独立知识点。");
  const settings = await storage.get({ endpoint: DEFAULT_ENDPOINT, token: "" });
  const endpoint = clean(settings.endpoint, 500);
  const token = clean(settings.token, 1000);
  if (!endpoint || !token) throw new Error("请先在扩展设置中保存专用同步令牌。");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) throw new Error(body.message || `上传失败（${response.status}）。`);
  return body;
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== "english-review-sync" || !message.payload) return;
  savePractice(message.payload)
    .then((result) => respond({ ok: true, accepted: result.accepted, richItemCount: result.richItemCount }))
    .catch((error) => respond({ ok: false, message: error instanceof Error ? error.message : "上传失败。" }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  storage.get(["endpoint"]).then((settings) => {
    if (!settings.endpoint) storage.set({ endpoint: DEFAULT_ENDPOINT });
  });
});
