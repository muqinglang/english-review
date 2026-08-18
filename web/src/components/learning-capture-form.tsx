"use client";

import { FormEvent, useState } from "react";

export type CaptureKnowledgeSpace = {
  id: string;
  name: string;
};

type CaptureResult = {
  action: "created" | "updated";
  learnedOn: string;
  nextDue: string;
  occurrences: number;
};

const ITEM_TYPES = [
  ["vocabulary", "Vocabulary"],
  ["expression", "Natural expression"],
  ["error", "Common mistake"],
  ["pronunciation", "Pronunciation / listening"],
  ["fact", "Fact"],
  ["concept", "Concept"],
  ["decision", "Decision"],
  ["quote", "Quote"],
] as const;

function shanghaiToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function LearningCaptureForm({ spaces }: { spaces: CaptureKnowledgeSpace[] }) {
  const today = shanghaiToday();
  const [knowledgeSpaceId, setKnowledgeSpaceId] = useState(spaces[0]?.id ?? "");
  const [cue, setCue] = useState("");
  const [answer, setAnswer] = useState("");
  const [example, setExample] = useState("");
  const [type, setType] = useState("vocabulary");
  const [priority, setPriority] = useState("medium");
  const [learnedOn, setLearnedOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CaptureResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/learning-items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          knowledgeSpaceId,
          cue,
          answer,
          example,
          type,
          priority,
          learnedOn,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? "Could not save the learning item.");
        return;
      }

      setResult(body as CaptureResult);
      setCue("");
      setAnswer("");
      setExample("");
    } catch {
      setError("Could not reach the save service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!spaces.length) {
    return (
      <section className="mt-8 rounded-2xl border border-[#dce4dc] bg-white p-8 text-center">
        <h2 className="text-xl font-black">No knowledge space yet</h2>
        <p className="mt-3 text-[#617068]">Create a knowledge space through the Worker first, then come back to add content.</p>
      </section>
    );
  }

  const inputClass = "mt-2 w-full rounded-xl border border-[#cfd9d2] bg-white px-4 py-3 outline-none focus:border-[#4e8a70]";

  return (
    <section className="mt-8 rounded-2xl border border-[#dce4dc] bg-white p-6 sm:p-8">
      <div className="rounded-xl bg-[#eff7f1] p-4 text-sm leading-6 text-[#315d4c]">
        <strong>You can backfill yesterday&apos;s chats too:</strong> set the &quot;Learned on&quot; date to yesterday, and anything you missed in English Tranning will come up for review today. Save one independently self-assessable item at a time; if the cue already exists, only its content and occurrence count are updated, and the existing schedule is not reset.
      </div>

      <form className="mt-7 grid gap-5" onSubmit={submit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <span className="text-sm font-extrabold">Knowledge space</span>
            <select className={inputClass} value={knowledgeSpaceId} onChange={(event) => setKnowledgeSpaceId(event.target.value)}>
              {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>
          <label>
            <span className="text-sm font-extrabold">Learned on (Shanghai time)</span>
            <input className={inputClass} type="date" max={today} required value={learnedOn} onChange={(event) => setLearnedOn(event.target.value)} />
          </label>
        </div>

        <label>
          <span className="text-sm font-extrabold">Prompt / cue</span>
          <textarea className={`${inputClass} min-h-24 resize-y`} maxLength={500} required value={cue} onChange={(event) => setCue(event.target.value)} placeholder="e.g. How do you tell insist on apart from persist in?" />
        </label>

        <label>
          <span className="text-sm font-extrabold">Answer</span>
          <textarea className={`${inputClass} min-h-32 resize-y`} maxLength={5000} required value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Write a concise answer or natural phrasing" />
        </label>

        <label>
          <span className="text-sm font-extrabold">Example (optional)</span>
          <textarea className={`${inputClass} min-h-24 resize-y`} maxLength={2000} value={example} onChange={(event) => setExample(event.target.value)} placeholder="e.g. She persisted in asking for an explanation." />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <span className="text-sm font-extrabold">Type</span>
            <select className={inputClass} value={type} onChange={(event) => setType(event.target.value)}>
              {ITEM_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span className="text-sm font-extrabold">Priority</span>
            <select className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>

        <div>
          <button type="submit" disabled={busy || !knowledgeSpaceId || !cue.trim() || !answer.trim()} className="rounded-xl bg-[#172223] px-6 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Saving…" : "Save and schedule review"}
          </button>
        </div>
      </form>

      {result && (
        <p className="mt-5 rounded-xl bg-[#eff7f1] p-4 text-sm font-bold text-[#285e48]" role="status">
          {result.action === "created"
            ? `Added. First review on ${result.nextDue}${result.learnedOn === today ? " (tomorrow)" : ""}.`
            : `Updated an existing item (seen ${result.occurrences} times total); the original schedule stays at ${result.nextDue}.`}
        </p>
      )}
      {error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}
