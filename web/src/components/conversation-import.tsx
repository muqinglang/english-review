"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaretDown, CaretUp, ClipboardText } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";

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

  return <Card className="mt-5 p-4 sm:p-5">
    <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-2 text-left">
      <span className="flex items-center gap-2 text-base font-black text-ink"><ClipboardText size={18} weight="bold" />Paste import</span>
      <span className="flex items-center gap-1 text-xs font-bold text-primary">{open ? "Collapse" : "Paste sync code from ChatGPT"}{open ? <CaretUp size={14} /> : <CaretDown size={14} />}</span>
    </button>
    {open && <div className="mt-4">
      <p className="text-sm leading-6 text-muted">Paste the whole <code className="rounded bg-mint px-1 py-0.5 text-[0.85em]">english-review-sync</code> block from ChatGPT and hit Import to start reviewing — no Chrome extension or token needed.</p>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        spellCheck={false}
        autoComplete="off"
        placeholder={'Paste {"space":"English Review","practiceDate":"...","items":[...]} or the whole ```english-review-sync block'}
        className="mt-3 font-mono text-xs"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" variant="primary" size="sm" disabled={busy || !text.trim()} onClick={runImport}>{busy ? "Importing…" : "Import"}</Button>
        {notice && <span role="status" className="text-sm font-bold text-primary-strong">{notice}</span>}
        {error && <span role="alert" className="text-sm font-bold text-danger">{error}</span>}
      </div>
    </div>}
  </Card>;
}
