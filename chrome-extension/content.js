const MARKER = /```english-review-sync\s*\n([\s\S]*?)\n```/g;
// A failed upload must remain eligible for the next scan (for example after a
// temporary server migration or network failure). Only a confirmed save is
// considered complete.
const completed = new Set();
const pending = new Set();
let timer = 0;

function notice(text, kind = "info") {
  let node = document.getElementById("english-review-sync-notice");
  if (!node) {
    node = document.createElement("div");
    node.id = "english-review-sync-notice";
    Object.assign(node.style, {
      position: "fixed", right: "16px", bottom: "16px", zIndex: "2147483647", maxWidth: "320px",
      padding: "10px 13px", borderRadius: "10px", color: "#fff", font: "600 13px/1.45 system-ui, sans-serif",
      boxShadow: "0 8px 24px rgba(0,0,0,.18)",
    });
    document.documentElement.appendChild(node);
  }
  node.style.background = kind === "error" ? "#9b3c2f" : "#286247";
  node.textContent = text;
  window.setTimeout(() => node?.remove(), 7000);
}

function fingerprint(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${hash >>> 0}:${value.length}`;
}

function parsePayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) return null;
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function submit(raw) {
  const text = raw.trim();
  if (!text) return false;
  const payload = parsePayload(text);
  // Chat history can contain older draft snippets. They are not actionable and
  // must never interrupt syncing a later valid review payload.
  if (!payload) return false;
  const id = fingerprint(text);
  if (completed.has(id) || pending.has(id)) return true;
  pending.add(id);
  chrome.runtime.sendMessage({ type: "english-review-sync", payload }, (result) => {
    pending.delete(id);
    if (chrome.runtime.lastError) {
      notice("复习同步扩展暂时不可用。", "error");
    } else if (result?.ok) {
      completed.add(id);
      const rich = typeof result.richItemCount === "number" ? `，其中 ${result.richItemCount} 项富内容` : "";
      notice(`已自动保存 ${result.accepted} 个复习项${rich}。`);
    } else {
      notice(result?.message || "复习项上传失败。", "error");
    }
  });
  return true;
}

function isSyncCodeCard(code) {
  let node = code;
  for (let depth = 0; node && node !== document.body && depth < 3; depth += 1, node = node.parentElement) {
    if (/english-review-sync/i.test(node.innerText || "")) return true;
  }
  return false;
}

function scan() {
  const text = document.body?.innerText || "";
  MARKER.lastIndex = 0;
  let match;
  const markedPayloads = [];
  while ((match = MARKER.exec(text))) {
    markedPayloads.push(match[1]);
  }
  for (const payload of markedPayloads.reverse()) {
    if (submit(payload)) return;
  }
  // ChatGPT renders Markdown code fences as a visual code card. The fence
  // characters are no longer present in innerText, so inspect only the most
  // recent matching card. Earlier failed drafts must not block a later retry.
  const cards = [...document.querySelectorAll("pre")].filter(isSyncCodeCard);
  for (const card of cards.reverse()) {
    if (submit(card.innerText || card.textContent || "")) return;
  }
}

function scheduleScan() {
  window.clearTimeout(timer);
  timer = window.setTimeout(scan, 700);
}

new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
scheduleScan();
