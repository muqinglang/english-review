"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaretDown, CaretUp, ClipboardText } from "@phosphor-icons/react";

/** Extract a JSON object from raw text or a ```english-review-sync fenced block. */
function extractPayload(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:english-review-sync)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonText);
}

export function ConversationImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function runImport() {
    setBusy(true);
    setError("");
    setNotice("");
    let payload: unknown;
    try {
      payload = extractPayload(text);
    } catch {
      setBusy(false);
      setError("无法解析 JSON。请粘贴完整的 english-review-sync 内容（{ 到 } 之间）。");
      return;
    }
    try {
      const response = await fetch("/api/practice/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) {
        throw new Error(typeof result.message === "string" ? result.message : "导入失败。");
      }
      setText("");
      setNotice(`已导入 ${result.accepted} 个学习项，其中 ${result.richItemCount} 项富内容。正在刷新…`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败。");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-5 rounded-2xl border border-[#dce4dc] bg-white p-4 sm:p-5">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-2 text-left">
      <span className="flex items-center gap-2 text-base font-black text-[#172223]"><ClipboardText size={18} weight="bold" />粘贴导入</span>
      <span className="flex items-center gap-1 text-xs font-bold text-[#4e8a70]">{open ? "收起" : "从 ChatGPT 粘贴同步代码"}{open ? <CaretUp size={14} /> : <CaretDown size={14} />}</span>
    </button>
    {open && <div className="mt-4">
      <p className="text-sm leading-6 text-[#617068]">把 ChatGPT 输出的 <code className="rounded bg-[#edf3ed] px-1 py-0.5 text-[0.85em]">english-review-sync</code> 代码块整段贴进来，点导入即可复习——不需要 Chrome 扩展或令牌。</p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        spellCheck={false}
        autoComplete="off"
        placeholder={'粘贴 {"space":"English Review","practiceDate":"...","items":[...]} 或整段 ```english-review-sync 代码块'}
        className="mt-3 w-full resize-y rounded-xl border border-[#cfd9d2] bg-[#fbfcfa] px-3.5 py-3 font-mono text-xs leading-6 text-[#172223] outline-none transition focus:border-[#4e8a70] focus:ring-2 focus:ring-[#4e8a70]/15"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !text.trim()} onClick={runImport} className="rounded-xl bg-[#172223] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#2d3c3c] disabled:opacity-50">{busy ? "导入中…" : "导入"}</button>
        {notice && <span role="status" className="text-sm font-bold text-[#286247]">{notice}</span>}
        {error && <span role="alert" className="text-sm font-bold text-[#9b3c2f]">{error}</span>}
      </div>
    </div>}
  </section>;
}
