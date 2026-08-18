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
      setError("Couldn't parse JSON. Paste the full english-review-sync content (from { to }).");
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
        throw new Error(typeof result.message === "string" ? result.message : "Import failed.");
      }
      setText("");
      setNotice(`Imported ${result.accepted} items (${result.richItemCount} with rich content). Refreshing…`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="mt-5 rounded-2xl border border-[#dce4dc] bg-white p-4 sm:p-5">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-2 text-left">
      <span className="flex items-center gap-2 text-base font-black text-[#172223]"><ClipboardText size={18} weight="bold" />Paste import</span>
      <span className="flex items-center gap-1 text-xs font-bold text-[#4e8a70]">{open ? "Collapse" : "Paste sync code from ChatGPT"}{open ? <CaretUp size={14} /> : <CaretDown size={14} />}</span>
    </button>
    {open && <div className="mt-4">
      <p className="text-sm leading-6 text-[#617068]">Paste the whole <code className="rounded bg-[#edf3ed] px-1 py-0.5 text-[0.85em]">english-review-sync</code> block from ChatGPT and hit Import to start reviewing — no Chrome extension or token needed.</p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        spellCheck={false}
        autoComplete="off"
        placeholder={'Paste {"space":"English Review","practiceDate":"...","items":[...]} or the whole ```english-review-sync block'}
        className="mt-3 w-full resize-y rounded-xl border border-[#cfd9d2] bg-[#fbfcfa] px-3.5 py-3 font-mono text-xs leading-6 text-[#172223] outline-none transition focus:border-[#4e8a70] focus:ring-2 focus:ring-[#4e8a70]/15"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !text.trim()} onClick={runImport} className="rounded-xl bg-[#172223] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#2d3c3c] disabled:opacity-50">{busy ? "Importing…" : "Import"}</button>
        {notice && <span role="status" className="text-sm font-bold text-[#286247]">{notice}</span>}
        {error && <span role="alert" className="text-sm font-bold text-[#9b3c2f]">{error}</span>}
      </div>
    </div>}
  </section>;
}
