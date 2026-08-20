"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChatCircleDots, Eye, EyeSlash, Headphones, Play, SpeakerHigh, Stack } from "@phosphor-icons/react";
import { ConversationImport } from "@/components/conversation-import";

type AttemptResult = "incorrect" | "partial" | "correct";

export type AudioCardData = {
  id: string;
  prompt: string;
  normal: string;
  slow?: string;
};

export type ReviewCardData = {
  reviewItemId: string;
  learningItemId: string;
  normalizedKey: string;
  position: number;
  cue: string;
  answer: string;
  example: string | null;
  stage: number;
  nextDue: string;
  lastResult: AttemptResult | null;
  gradedResult: AttemptResult | null;
  stale: boolean;
  status: string;
  shownAt: string | null;
};

export type YesterdayConversationItemData = {
  id: string;
  normalizedKey: string;
  cue: string;
  answer: string;
  example: string | null;
  graded: boolean;
};

type LifeScenarioExample = {
  scenario?: string;
  english: string;
  chinese?: string;
};

type RichAnswer = {
  meaning: string;
  explanation?: string;
  usageTip?: string;
  examples: LifeScenarioExample[];
};

type Review = {
  id: string;
  date: string;
  title: string;
  markdown: string;
  duration: string;
  level: string;
  audioCards: AudioCardData[];
  cards: ReviewCardData[];
};

export type ConversationSessionData = {
  id: string;
  date: string;
  items: YesterdayConversationItemData[];
};

export type ReviewLibraryData = {
  id: string;
  name: string;
  reviews: Review[];
  conversationSessions: ConversationSessionData[];
};

type CardState = {
  revealed?: boolean;
  submitting?: boolean;
  result?: AttemptResult;
  nextDue?: string;
  stage?: number;
  status?: string;
  stale?: boolean;
  error?: string;
};

type AttemptPayload = {
  ok?: boolean;
  message?: string;
  lastResult?: unknown;
  nextDue?: unknown;
  reviewStage?: unknown;
  stage?: unknown;
  status?: unknown;
  learningItem?: {
    nextDue?: unknown;
    reviewStage?: unknown;
    stage?: unknown;
    status?: unknown;
  };
};

const resultLabels: Record<AttemptResult, string> = {
  incorrect: "Forgot",
  partial: "Unsure",
  correct: "Got it",
};

const statusLabels: Record<string, string> = {
  learning: "Learning",
  reviewing: "Reviewing",
  mastered: "Mastered",
  pending_confirmation: "Pending",
};

// Daily re-grading keeps the three buttons available after a save, so the button
// matching the currently recorded rating gets a selected treatment (ring + check)
// — otherwise a saved rating looks unsaved.
const rateOptions: { result: AttemptResult; label: string; base: string; ring: string }[] = [
  { result: "incorrect", label: "Forgot · try tomorrow", base: "border-[#e2b7ad] bg-[#fff8f6] text-[#944c3f] hover:bg-[#fcebe7]", ring: "ring-[#c87563]" },
  { result: "partial", label: "Unsure · review soon", base: "border-[#dec991] bg-[#fffaf0] text-[#80631c] hover:bg-[#fbf1d6]", ring: "ring-[#c6a54e]" },
  { result: "correct", label: "Got it · longer interval", base: "border-[#a9cbb7] bg-[#f1faf4] text-[#286247] hover:bg-[#e2f3e8]", ring: "ring-[#5a9b78]" },
];

function ExamplePlayButton({ id, text, playingId, onPlay }: { id: string; text: string; playingId: string; onPlay: (id: string, text: string) => void }) {
  const active = playingId === id;
  return <button
    type="button"
    aria-label={active ? "Playing" : "Play example"}
    title="Read aloud with your chosen voice"
    onClick={() => onPlay(id, text)}
    className={`grid size-7 shrink-0 place-items-center rounded-lg border transition ${active ? "border-[#2f755f] bg-[#e2f3e8] text-[#286247]" : "border-[#c8d5cd] bg-white text-[#315f4f] hover:bg-[#edf5ef]"}`}
  >
    <SpeakerHigh size={15} weight={active ? "fill" : "regular"} />
  </button>;
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-[#edf3ed] px-1.5 py-0.5 font-mono text-[0.92em] text-[#245f4d]">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-extrabold text-[#172223]">{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  })}</>;
}

function MarkdownReview({ markdown }: { markdown: string }) {
  return <div className="space-y-3 text-[15px] leading-7 text-[#41514b]">{markdown.split(/\r?\n/).map((raw, index) => {
    const line = raw.trim();
    if (!line) return <div key={index} className="h-2" />;
    if (line.startsWith("# ")) return <h2 key={index} className="text-2xl font-black text-[#172223]">{line.slice(2)}</h2>;
    if (line.startsWith("## ")) return <h3 key={index} className="mt-8 border-t border-[#dce4dc] pt-7 text-xl font-black text-[#172223]">{line.slice(3)}</h3>;
    if (line.startsWith("### ")) return <h4 key={index} className="mt-5 text-base font-extrabold text-[#2f755f]">{line.slice(4)}</h4>;
    const numbered = line.match(/^(\d+)\.\s+(.*)$/);
    if (numbered) {
      return <div key={index} className="flex gap-3"><span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#dff0e4] text-xs font-black text-[#2f755f]">{numbered[1]}</span><p><InlineText text={numbered[2]} /></p></div>;
    }
    if (line.startsWith("- ")) return <div key={index} className="flex gap-3 pl-2"><span className="text-[#62a181]">•</span><p><InlineText text={line.slice(2)} /></p></div>;
    return <p key={index}><InlineText text={line} /></p>;
  })}</div>;
}

function speak(text: string, rate: number, onEnd: () => void) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((item) => item.lang.toLowerCase().startsWith("en-us"))
    ?? voices.find((item) => item.lang.toLowerCase().startsWith("en"));
  if (voice) utterance.voice = voice;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value ? value : fallback;
}

function stageValue(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDueDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${MONTH_NAMES[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}` : value;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseScenarioExample(value: unknown): LifeScenarioExample | null {
  if (typeof value === "string") {
    const english = value.trim();
    return english ? { english } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const item = value as Record<string, unknown>;
  const english = cleanText(item.english) ?? cleanText(item.sentence) ?? cleanText(item.example);
  if (!english) return null;
  const scenario = cleanText(item.scenario) ?? cleanText(item.label) ?? cleanText(item.context) ?? cleanText(item.title);
  const chinese = cleanText(item.chinese) ?? cleanText(item.translation) ?? cleanText(item.meaning);
  return { ...(scenario ? { scenario } : {}), english, ...(chinese ? { chinese } : {}) };
}

function parsePlainExamples(value: string): LifeScenarioExample[] {
  const blocks = value
    .split(/\r?\n\s*\r?\n|\r?\n(?=\s*(?:[-•]|\d+[.)、])\s*)/)
    .map((block) => block.replace(/^\s*(?:[-•]|\d+[.)、])\s*/, "").trim())
    .filter(Boolean);
  return blocks.map((english) => ({ english }));
}

/**
 * New review generators can store a richer payload in the existing `example`
 * text column, so old rows keep working and no destructive schema migration is
 * needed. Plain example text remains a valid fallback.
 */
function parseRichAnswer(card: Pick<ReviewCardData, "answer" | "example">): RichAnswer {
  const fallback: RichAnswer = {
    meaning: card.answer,
    examples: card.example ? parsePlainExamples(card.example) : [],
  };
  if (!card.example?.trim().startsWith("{")) return fallback;

  try {
    const payload = JSON.parse(card.example) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fallback;
    const record = payload as Record<string, unknown>;
    const rawExamples = Array.isArray(record.examples)
      ? record.examples
      : Array.isArray(record.scenarios)
        ? record.scenarios
      : Array.isArray(record.lifeExamples)
        ? record.lifeExamples
        : [];
    const examples = rawExamples
      .map(parseScenarioExample)
      .filter((item): item is LifeScenarioExample => Boolean(item));
    return {
      meaning: cleanText(record.meaning) ?? card.answer,
      ...(cleanText(record.explanation) ? { explanation: cleanText(record.explanation) } : {}),
      ...(cleanText(record.usageTip) ? { usageTip: cleanText(record.usageTip) } : {}),
      examples,
    };
  } catch {
    // A truncated structured payload should never appear as raw JSON in the UI.
    return { meaning: card.answer, examples: [] };
  }
}

function LatestConversationReview({ items, reviewDate, isLatest, onPlay, playingId }: { items: YesterdayConversationItemData[]; reviewDate: string | null; isLatest: boolean; onPlay: (id: string, text: string) => void; playingId: string }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  // Each life-scenario sentence stays hidden so the user can listen first and
  // only reveal English + Chinese (keyed by `${itemId}:${exampleIndex}`) on demand.
  const [revealedExamples, setRevealedExamples] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, AttemptResult>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Parse each item's rich answer once, not on every reveal/self-grade re-render.
  const richAnswers = useMemo(
    () => new Map(items.map((item) => [item.id, parseRichAnswer(item)])),
    [items],
  );
  if (!items.length) {
    return <section className="mt-5 rounded-2xl border border-dashed border-[#c8dccc] bg-[#f8fbf8] p-5 sm:p-6" aria-labelledby="latest-conversation-title">
      <p id="latest-conversation-title" className="text-lg font-black text-[#286247]">Latest conversation review</p>
      <p className="mt-2 text-sm leading-6 text-[#416454]">No ChatGPT conversation has synced yet. We won&apos;t fall back to an old daily review pack.</p>
    </section>;
  }

  async function submit(item: YesterdayConversationItemData, result: AttemptResult) {
    if (submitting[item.id] || results[item.id]) return;
    setSubmitting((current) => ({ ...current, [item.id]: true }));
    setErrors((current) => ({ ...current, [item.id]: "" }));
    try {
      const response = await fetch("/api/practice/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ practiceItemId: item.id, requestId: crypto.randomUUID(), result, submittedText: "" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) throw new Error(typeof payload.message === "string" ? payload.message : "Couldn't save your rating.");
      setResults((current) => ({ ...current, [item.id]: result }));
    } catch (error) {
      setErrors((current) => ({ ...current, [item.id]: error instanceof Error ? error.message : "Couldn't save your rating." }));
    } finally {
      setSubmitting((current) => ({ ...current, [item.id]: false }));
    }
  }

  return <section className="mt-5 rounded-2xl border border-[#c8dccc] bg-[#f5faf5] p-5 sm:p-6" aria-labelledby="latest-conversation-title">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p id="latest-conversation-title" className="text-lg font-black text-[#286247]">{isLatest ? "Latest conversation review" : "Conversation review"}</p>
        <p className="mt-1 text-sm leading-6 text-[#416454]">{items.length} items synced from {reviewDate}. Answer in your head first, then rate yourself — results enter the spaced-repetition history.</p>
      </div>
      <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#2f755f]">Conversation sync</span>
    </div>
    <div className="mt-5 grid gap-3">
      {items.map((item, index) => {
        const richAnswer = richAnswers.get(item.id) ?? parseRichAnswer(item);
        const isRevealed = revealed[item.id] ?? false;
        return <article key={item.id} className="rounded-xl border border-[#dce4dc] bg-white p-4">
          <p className="text-xs font-extrabold tracking-[0.1em] text-[#2f755f]">Item {index + 1}</p>
          <h3 className="mt-2 font-black leading-7 text-[#172223]">{item.cue}</h3>
          {!isRevealed ? <button type="button" onClick={() => setRevealed((current) => ({ ...current, [item.id]: true }))} className="mt-3 rounded-lg border border-[#b9c9bf] bg-white px-3 py-2 text-sm font-extrabold text-[#315f4f] hover:bg-[#edf5ef]">Show answer</button> : <div className="mt-4 overflow-hidden rounded-xl border border-[#dce4dc]">
            <section className="p-4">
              <p className="text-xs font-extrabold tracking-[0.12em] text-[#6b7b74]">Core meaning</p>
              <p className="mt-2 text-base font-bold leading-7 text-[#172223]">{richAnswer.meaning}</p>
            </section>
            {richAnswer.explanation && <section className="border-t border-[#e3e9e3] bg-[#fbfcfa] p-4">
              <p className="text-xs font-extrabold tracking-[0.12em] text-[#6b7b74]">How to think of it</p>
              <p className="mt-2 text-sm leading-7 text-[#41514b]">{richAnswer.explanation}</p>
            </section>}
            {richAnswer.examples.length > 0 && <section className="border-t border-[#e3e9e3] p-4">
              <p className="text-xs font-extrabold tracking-[0.12em] text-[#6b7b74]">In real life</p>
              <p className="mt-1 text-xs leading-5 text-[#7c8b83]">Listen first; if you can&apos;t catch it, tap the eye to reveal the English and translation.</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {richAnswer.examples.map((example, exampleIndex) => {
                  const exampleKey = `${item.id}:${exampleIndex}`;
                  const exampleShown = revealedExamples[exampleKey] ?? false;
                  return <article key={`${example.english}-${exampleIndex}`} className="rounded-xl bg-[#f3f7f2] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-extrabold text-[#2f755f]">{example.scenario ?? `Scene ${exampleIndex + 1}`}</p>
                      <div className="flex items-center gap-1.5">
                        <ExamplePlayButton id={`conv:${item.id}:${exampleIndex}`} text={example.english} playingId={playingId} onPlay={onPlay} />
                        <button
                          type="button"
                          aria-label={exampleShown ? "Hide text and translation" : "Show text and translation"}
                          aria-pressed={exampleShown}
                          title={exampleShown ? "Hide text" : "Listen first, reveal if needed"}
                          onClick={() => setRevealedExamples((current) => ({ ...current, [exampleKey]: !exampleShown }))}
                          className="grid size-7 shrink-0 place-items-center rounded-lg border border-[#c8d5cd] bg-white text-[#315f4f] transition hover:bg-[#edf5ef]"
                        >
                          {exampleShown ? <EyeSlash size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                    {exampleShown ? <>
                      <p className="mt-2 text-sm font-semibold leading-6 text-[#172223]">{example.english}</p>
                      {example.chinese && <p className="mt-2 text-sm leading-6 text-[#596861]">{example.chinese}</p>}
                    </> : <p className="mt-2 text-sm leading-6 text-[#98a69c]">Text hidden · listen first, tap the eye at the top-right to reveal.</p>}
                  </article>;
                })}
              </div>
            </section>}
            {richAnswer.usageTip && <section className="border-t border-[#e3e9e3] bg-[#fffaf0] p-4">
              <p className="text-xs font-extrabold tracking-[0.12em] text-[#80631c]">Usage tip</p>
              <p className="mt-2 text-sm leading-7 text-[#5f512d]">{richAnswer.usageTip}</p>
            </section>}
            <div className="border-t border-[#e3e9e3] bg-[#f1f8f3] p-4">
              {results[item.id] ? <p className="font-extrabold text-[#286247]">Rated: {resultLabels[results[item.id]]} — added to the review schedule.</p> : item.graded ? <p className="font-extrabold text-[#286247]">Rated — added to the review schedule. Continue in “Review History”.</p> : <div className="flex flex-wrap gap-2">
                {(["incorrect", "partial", "correct"] as AttemptResult[]).map((result) => <button key={result} type="button" disabled={submitting[item.id]} onClick={() => submit(item, result)} className={`rounded-lg border px-3 py-2 text-xs font-extrabold transition disabled:opacity-50 ${result === "incorrect" ? "border-[#e2b7ad] bg-[#fff8f6] text-[#944c3f] hover:bg-[#fcebe7]" : result === "partial" ? "border-[#dec991] bg-[#fffaf0] text-[#80631c] hover:bg-[#fbf1d6]" : "border-[#a9cbb7] bg-[#f1faf4] text-[#286247] hover:bg-[#e2f3e8]"}`}>{submitting[item.id] ? "Saving…" : resultLabels[result]}</button>)}
              </div>}
              {errors[item.id] && <p className="mt-2 font-semibold text-[#9b3c2f]">{errors[item.id]}</p>}
            </div>
          </div>}
        </article>;
      })}
    </div>
  </section>;
}

function ReviewCards({
  cards,
  states,
  onReveal,
  onSubmit,
  onPlay,
  playingId,
}: {
  cards: ReviewCardData[];
  states: Record<string, CardState>;
  onReveal: (reviewItemId: string) => void;
  onSubmit: (card: ReviewCardData, result: AttemptResult) => void;
  onPlay: (id: string, text: string) => void;
  playingId: string;
}) {
  // Parse each card's rich answer once; reveal/self-grade re-renders reuse it.
  const richAnswers = useMemo(
    () => new Map(cards.map((card) => [card.reviewItemId, parseRichAnswer(card)])),
    [cards],
  );
  // Listen-first: each life-scenario sentence stays hidden until the user reveals
  // its English + Chinese (keyed by `${reviewItemId}:${exampleIndex}`).
  const [revealedExamples, setRevealedExamples] = useState<Record<string, boolean>>({});
  return <div className="space-y-4">
    <div className="rounded-xl bg-[#edf5ef] p-4 text-sm leading-6 text-[#416454]">
      {cards.length} items today. Say the answer in your head, then tap “Show answer” and rate yourself honestly — that sets your next review.
    </div>
    {cards.map((card, index) => {
      const state = states[card.reviewItemId] ?? {};
      // Old cards can be re-graded on any later day, so a prior grade never locks
      // the card — it only shows the last self-assessment and current schedule.
      const lastRecorded = state.result ?? card.gradedResult ?? card.lastResult ?? undefined;
      const nextDue = state.nextDue ?? card.nextDue;
      const stage = state.stage ?? card.stage;
      const status = state.status ?? card.status;
      const titleId = `review-card-${card.reviewItemId}`;
      const richAnswer = richAnswers.get(card.reviewItemId) ?? parseRichAnswer(card);

      return <article key={card.reviewItemId} aria-labelledby={titleId} aria-busy={state.submitting || undefined} className="rounded-2xl border border-[#dce4dc] bg-[#fcfdfb] p-5 sm:p-6">
        <p className="text-xs font-extrabold tracking-[0.12em] text-[#2f755f]">Item {index + 1} of {cards.length}</p>
        <h3 id={titleId} className="mt-3 text-lg font-black leading-8 text-[#172223]">{card.cue}</h3>

        {!state.revealed ? (
          <button
            type="button"
            aria-expanded="false"
            onClick={() => onReveal(card.reviewItemId)}
            className="mt-5 rounded-lg bg-[#172223] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#2d3c3c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f755f]"
          >
            {lastRecorded ? "Show answer & status" : "Show answer"}
          </button>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="overflow-hidden rounded-xl border border-[#dce4dc] bg-white">
              <section className="p-4 sm:p-5" aria-labelledby={`${titleId}-meaning`}>
                <p id={`${titleId}-meaning`} className="text-xs font-extrabold tracking-[0.12em] text-[#6b7b74]">Core meaning</p>
                <p className="mt-2 whitespace-pre-wrap text-base font-bold leading-7 text-[#172223]">{richAnswer.meaning}</p>
              </section>

              {richAnswer.explanation && <section className="border-t border-[#e3e9e3] bg-[#fbfcfa] p-4 sm:p-5" aria-labelledby={`${titleId}-explanation`}>
                <p id={`${titleId}-explanation`} className="text-xs font-extrabold tracking-[0.12em] text-[#6b7b74]">How to think of it</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#41514b]">{richAnswer.explanation}</p>
              </section>}

              {richAnswer.examples.length > 0 && <section className="border-t border-[#e3e9e3] p-4 sm:p-5" aria-labelledby={`${titleId}-examples`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p id={`${titleId}-examples`} className="text-xs font-extrabold tracking-[0.12em] text-[#6b7b74]">In real life</p>
                  <p className="text-xs font-semibold text-[#819087]">{richAnswer.examples.length} total</p>
                </div>
                <p className="mt-1 text-xs leading-5 text-[#7c8b83]">Listen first; if you can&apos;t catch it, tap the eye to reveal the English and translation.</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {richAnswer.examples.map((example, exampleIndex) => {
                    const exampleKey = `${card.reviewItemId}:${exampleIndex}`;
                    const exampleShown = revealedExamples[exampleKey] ?? false;
                    return <article key={`${example.english}-${exampleIndex}`} className="rounded-xl bg-[#f3f7f2] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-extrabold text-[#2f755f]">{example.scenario ?? `Scene ${exampleIndex + 1}`}</p>
                        <div className="flex items-center gap-1.5">
                          <ExamplePlayButton id={`hist:${card.reviewItemId}:${exampleIndex}`} text={example.english} playingId={playingId} onPlay={onPlay} />
                          <button
                            type="button"
                            aria-label={exampleShown ? "Hide text and translation" : "Show text and translation"}
                            aria-pressed={exampleShown}
                            title={exampleShown ? "Hide text" : "Listen first, reveal if needed"}
                            onClick={() => setRevealedExamples((current) => ({ ...current, [exampleKey]: !exampleShown }))}
                            className="grid size-7 shrink-0 place-items-center rounded-lg border border-[#c8d5cd] bg-white text-[#315f4f] transition hover:bg-[#edf5ef]"
                          >
                            {exampleShown ? <EyeSlash size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                      {exampleShown ? <>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#172223]">{example.english}</p>
                        {example.chinese && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#627169]">{example.chinese}</p>}
                      </> : <p className="mt-2 text-sm leading-6 text-[#98a69c]">Text hidden · listen first, tap the eye at the top-right to reveal.</p>}
                    </article>;
                  })}
                </div>
              </section>}

              {richAnswer.usageTip && <section className="border-t border-[#e3e9e3] bg-[#fffaf0] p-4 sm:p-5" aria-labelledby={`${titleId}-usage-tip`}>
                <p id={`${titleId}-usage-tip`} className="text-xs font-extrabold tracking-[0.12em] text-[#80631c]">Usage tip</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#5f512d]">{richAnswer.usageTip}</p>
              </section>}
            </div>

            {lastRecorded && (
              <div role="status" className="rounded-xl bg-[#edf5ef] p-4 text-sm leading-6 text-[#315f4f]">
                <p className="font-extrabold">Last rating: {resultLabels[lastRecorded]}</p>
                <p className="mt-1">Next review: {formatDueDate(nextDue)} · Stage {stage} · {statusLabels[status] ?? status}</p>
              </div>
            )}
            <fieldset disabled={state.submitting}>
              <legend className="text-sm font-extrabold text-[#41514b]">{lastRecorded ? "Rate again today (yesterday's “Got it” doesn't mean you remember today — update anytime)" : "How well did you recall it?"}</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {rateOptions.map((option) => {
                  const isCurrent = lastRecorded === option.result;
                  return <button key={option.result} type="button" aria-pressed={isCurrent} onClick={() => onSubmit(card, option.result)} className={`rounded-lg border px-4 py-2.5 text-sm font-bold transition disabled:cursor-wait disabled:opacity-55 ${option.base} ${isCurrent ? `ring-2 ring-offset-1 ${option.ring}` : ""}`}>{isCurrent ? "✓ " : ""}{option.label}{isCurrent ? " · saved" : ""}</button>;
                })}
              </div>
              {state.submitting && <p aria-live="polite" className="mt-3 text-sm font-bold text-[#4e8a70]">Saving your rating…</p>}
            </fieldset>
            {state.error && <p role="alert" className="rounded-lg bg-[#fff1ee] px-3 py-2 text-sm font-bold text-[#944c3f]">{state.error}</p>}
          </div>
        )}
      </article>;
    })}
  </div>;
}

export function ReviewLibrary({
  libraries,
  loadWarning = false,
  elevenLabsVoices = [],
}: {
  libraries: ReviewLibraryData[];
  loadWarning?: boolean;
  elevenLabsVoices?: { voiceId: string; name: string }[];
}) {
  const [libraryId, setLibraryId] = useState(libraries[0]?.id ?? "");
  const [reviewId, setReviewId] = useState(libraries[0]?.reviews[0]?.id ?? "");
  const [conversationSessionId, setConversationSessionId] = useState(libraries[0]?.conversationSessions[0]?.id ?? "");
  const [activeTab, setActiveTab] = useState<"conversation" | "history" | "audio">("conversation");
  const [ttsProvider, setTtsProvider] = useState<"fish_audio" | "elevenlabs">("fish_audio");
  const [selectedVoiceId, setSelectedVoiceId] = useState(elevenLabsVoices[0]?.voiceId ?? "");
  const [playing, setPlaying] = useState("");
  const [audioNotice, setAudioNotice] = useState("");
  const [visibleAudioTranscripts, setVisibleAudioTranscripts] = useState<Record<string, boolean>>({});
  const [audioDrafts, setAudioDrafts] = useState<Record<string, string>>({});
  const [storyByReview, setStoryByReview] = useState<Record<string, string>>({});
  const [storyBusy, setStoryBusy] = useState(false);
  const [storyError, setStoryError] = useState("");
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const objectUrlsRef = useRef(new Map<string, string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const submittingIdsRef = useRef(new Set<string>());

  const library = libraries.find((item) => item.id === libraryId) ?? libraries[0];
  const review = useMemo(
    () => library?.reviews.find((item) => item.id === reviewId) ?? library?.reviews[0],
    [library, reviewId],
  );
  const conversationSession = useMemo(
    () => library?.conversationSessions.find((item) => item.id === conversationSessionId) ?? library?.conversationSessions[0],
    [library, conversationSessionId],
  );
  useEffect(() => {
    const objectUrls = objectUrlsRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      playbackSequenceRef.current += 1;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
      }
      window.speechSynthesis.cancel();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
    };
  }, []);
  useEffect(() => {
    const saved = window.localStorage.getItem("english-review-tts-provider");
    const savedVoice = window.localStorage.getItem("english-review-elevenlabs-voice");
    const frame = window.requestAnimationFrame(() => {
      if (saved === "fish_audio" || saved === "elevenlabs") {
        setTtsProvider(saved);
      } else if (elevenLabsVoices.length > 0) {
        // No explicit choice yet: if the learner has configured ElevenLabs voices,
        // play with them instead of silently defaulting to Fish Audio's voice.
        setTtsProvider("elevenlabs");
      }
      if (savedVoice && elevenLabsVoices.some((voice) => voice.voiceId === savedVoice)) {
        setSelectedVoiceId(savedVoice);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [elevenLabsVoices]);

  function chooseVoice(voiceId: string) {
    setSelectedVoiceId(voiceId);
    window.localStorage.setItem("english-review-elevenlabs-voice", voiceId);
  }

  function cancelPlayback() {
    playbackSequenceRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    window.speechSynthesis.cancel();
    setPlaying("");
  }

  function resetReviewState() {
    cancelPlayback();
    setAudioNotice("");
    setActiveTab("conversation");
  }

  function chooseLibrary(id: string) {
    const next = libraries.find((item) => item.id === id);
    resetReviewState();
    setLibraryId(id);
    setReviewId(next?.reviews[0]?.id ?? "");
    setConversationSessionId(next?.conversationSessions[0]?.id ?? "");
  }

  function chooseReview(id: string) {
    resetReviewState();
    setReviewId(id);
  }

  function chooseConversationSession(id: string) {
    cancelPlayback();
    setConversationSessionId(id);
  }

  function revealCard(reviewItemId: string) {
    setCardStates((current) => ({
      ...current,
      [reviewItemId]: { ...current[reviewItemId], revealed: true },
    }));
  }

  async function submitAttempt(card: ReviewCardData, result: AttemptResult) {
    // Re-grading an old card is allowed on any later day, so only an in-flight
    // request for this same card blocks a submit; the server keeps same-day
    // re-grades idempotent (last-wins).
    if (submittingIdsRef.current.has(card.reviewItemId)) return;

    submittingIdsRef.current.add(card.reviewItemId);
    setCardStates((current) => ({
      ...current,
      [card.reviewItemId]: {
        ...current[card.reviewItemId],
        revealed: true,
        submitting: true,
        error: undefined,
      },
    }));

    try {
      const response = await fetch("/api/review/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewItemId: card.reviewItemId,
          result,
          requestId: crypto.randomUUID(),
          submittedText: "",
        }),
      });
      const payload = await response.json().catch(() => null) as AttemptPayload | null;
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message ?? "Couldn't save your rating. Please try again.");
      }
      if (!mountedRef.current) return;

      const nested = payload?.learningItem;
      const nextDue = stringValue(payload?.nextDue ?? nested?.nextDue, card.nextDue);
      const stage = stageValue(
        payload?.reviewStage ?? payload?.stage ?? nested?.reviewStage ?? nested?.stage,
        card.stage,
      );
      const status = stringValue(payload?.status ?? nested?.status, card.status);
      const recordedResult = typeof payload?.lastResult === "string"
        && payload.lastResult in resultLabels
        ? payload.lastResult as AttemptResult
        : result;
      setCardStates((current) => ({
        ...current,
        [card.reviewItemId]: {
          ...current[card.reviewItemId],
          revealed: true,
          submitting: false,
          result: recordedResult,
          nextDue,
          stage,
          status,
          error: undefined,
        },
      }));
    } catch (error) {
      if (!mountedRef.current) return;
      setCardStates((current) => ({
        ...current,
        [card.reviewItemId]: {
          ...current[card.reviewItemId],
          revealed: true,
          submitting: false,
          error: error instanceof Error ? error.message : "Couldn't save your rating. Please try again.",
        },
      }));
    } finally {
      submittingIdsRef.current.delete(card.reviewItemId);
    }
  }

  const voiceIdForRequest = ttsProvider === "elevenlabs" ? selectedVoiceId : "";

  async function playAudio(playbackId: string, sourceReviewId: string, cardId: string, variant: "normal" | "slow", fallbackText: string, speed: 1 | 0.75) {
    cancelPlayback();
    const sequence = playbackSequenceRef.current;
    const cacheKey = JSON.stringify([sourceReviewId, cardId, variant, speed, ttsProvider, voiceIdForRequest]);
    setPlaying(playbackId);
    setAudioNotice("");

    let fallbackStarted = false;
    const finish = () => {
      if (mountedRef.current && sequence === playbackSequenceRef.current) setPlaying("");
    };
    const fallbackToBrowser = () => {
      if (!mountedRef.current || fallbackStarted || sequence !== playbackSequenceRef.current) return;
      fallbackStarted = true;
      audioRef.current = null;
      setAudioNotice("Couldn't generate audio this time; switched to the browser's English voice. Check your key or quota in Settings.");
      speak(fallbackText, speed, finish);
    };

    try {
      let objectUrl = objectUrlsRef.current.get(cacheKey);
      if (!objectUrl) {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewId: sourceReviewId, cardId, variant, speed, provider: ttsProvider, voiceId: voiceIdForRequest }),
        });
        if (!response.ok) throw new Error("TTS unavailable");
        const audioBlob = await response.blob();
        if (!audioBlob.size) throw new Error("Empty TTS response");
        objectUrl = URL.createObjectURL(audioBlob);
        if (!mountedRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        objectUrlsRef.current.set(cacheKey, objectUrl);
      }
      if (sequence !== playbackSequenceRef.current) return;

      const audio = new Audio(objectUrl);
      audio.playbackRate = speed;
      audioRef.current = audio;
      audio.onended = finish;
      audio.onerror = fallbackToBrowser;
      await audio.play();
    } catch {
      fallbackToBrowser();
    }
  }

  // Speak arbitrary on-page text (e.g. an example sentence) with the learner's
  // configured provider + selected voice, caching each clip and falling back to
  // the browser voice so a play tap is never silent.
  async function playText(playbackId: string, text: string, speed: 1 | 0.75 = 1) {
    const trimmed = text.trim();
    if (!trimmed) return;
    cancelPlayback();
    const sequence = playbackSequenceRef.current;
    const cacheKey = JSON.stringify(["speak", ttsProvider, voiceIdForRequest, trimmed]);
    setPlaying(playbackId);
    setAudioNotice("");

    let fallbackStarted = false;
    const finish = () => {
      if (mountedRef.current && sequence === playbackSequenceRef.current) setPlaying("");
    };
    const fallbackToBrowser = () => {
      if (!mountedRef.current || fallbackStarted || sequence !== playbackSequenceRef.current) return;
      fallbackStarted = true;
      audioRef.current = null;
      setAudioNotice("Couldn't generate audio this time; switched to the browser's English voice. Check your key or quota in Settings.");
      speak(trimmed, speed, finish);
    };

    try {
      let objectUrl = objectUrlsRef.current.get(cacheKey);
      if (!objectUrl) {
        const response = await fetch("/api/tts/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: trimmed, provider: ttsProvider, voiceId: voiceIdForRequest }),
        });
        if (!response.ok) throw new Error("TTS unavailable");
        const audioBlob = await response.blob();
        if (!audioBlob.size) throw new Error("Empty TTS response");
        objectUrl = URL.createObjectURL(audioBlob);
        if (!mountedRef.current) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        objectUrlsRef.current.set(cacheKey, objectUrl);
      }
      if (sequence !== playbackSequenceRef.current) return;

      const audio = new Audio(objectUrl);
      audio.playbackRate = speed;
      audioRef.current = audio;
      audio.onended = finish;
      audio.onerror = fallbackToBrowser;
      await audio.play();
    } catch {
      fallbackToBrowser();
    }
  }

  // Ask DeepSeek (server-side) to weave the current review's due words into one
  // short story, then let the learner listen/dictate it with the same voice.
  async function generateStory(sourceReviewId: string) {
    if (storyBusy) return;
    cancelPlayback();
    setStoryBusy(true);
    setStoryError("");
    try {
      const response = await fetch("/api/listening/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: sourceReviewId }),
      });
      const payload = await response.json().catch(() => null) as { story?: string; message?: string } | null;
      if (!response.ok || !payload?.story) {
        throw new Error(payload?.message ?? "Couldn't write a story right now. Please try again.");
      }
      if (!mountedRef.current) return;
      setStoryByReview((current) => ({ ...current, [sourceReviewId]: payload.story! }));
    } catch (error) {
      if (!mountedRef.current) return;
      setStoryError(error instanceof Error ? error.message : "Couldn't write a story right now. Please try again.");
    } finally {
      if (mountedRef.current) setStoryBusy(false);
    }
  }

  if (!library) return null;

  return <>
    {loadWarning && <div role="alert" className="mt-8 rounded-xl border border-[#dec991] bg-[#fffaf0] p-4 text-sm leading-6 text-[#80631c]">Some structured review data couldn&apos;t load right now; older content is still visible. Refresh in a moment, and if it persists, check the database migrations and server logs.</div>}
    <div className={`${loadWarning ? "mt-4" : "mt-8"} grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]`}>
    <aside className="h-fit rounded-2xl border border-[#dce4dc] bg-[#f8faf7] p-3">
      <p className="px-3 pb-2 text-xs font-extrabold tracking-[0.14em] text-[#6b7b74]">Categories</p>
      <div className="space-y-2">{libraries.map((item) => <button key={item.id} type="button" onClick={() => chooseLibrary(item.id)} className={`w-full rounded-xl px-3 py-3 text-left text-sm font-extrabold transition ${item.id === library.id ? "bg-[#172223] text-white" : "text-[#41514b] hover:bg-white"}`}>{item.name}<span className={`mt-1 block text-xs font-medium ${item.id === library.id ? "text-white/60" : "text-[#819087]"}`}>{item.reviews.length ? `${item.reviews.length} reviews` : "Waiting for content"}</span></button>)}</div>
    </aside>

    <section className="min-w-0 rounded-2xl border border-[#dce4dc] bg-white p-5 sm:p-8">
      <div className="flex gap-1 rounded-xl bg-[#f3f6f2] p-1.5" role="tablist" aria-label="Review content">
        <button type="button" role="tab" aria-selected={activeTab === "conversation"} onClick={() => { cancelPlayback(); setActiveTab("conversation"); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-extrabold transition ${activeTab === "conversation" ? "bg-white text-[#172223] shadow-sm" : "text-[#718078] hover:text-[#41514b]"}`}><ChatCircleDots size={17} />Conversation</button>
        <button type="button" role="tab" aria-selected={activeTab === "history"} onClick={() => { cancelPlayback(); setActiveTab("history"); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-extrabold transition ${activeTab === "history" ? "bg-white text-[#172223] shadow-sm" : "text-[#718078] hover:text-[#41514b]"}`}><Stack size={17} />Review History</button>
        <button type="button" role="tab" aria-selected={activeTab === "audio"} onClick={() => setActiveTab("audio")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-extrabold transition ${activeTab === "audio" ? "bg-white text-[#172223] shadow-sm" : "text-[#718078] hover:text-[#41514b]"}`}><Headphones size={17} />Listening</button>
      </div>

      {ttsProvider === "elevenlabs" && elevenLabsVoices.length > 0 && <label className="mt-4 flex flex-wrap items-center gap-2 text-sm font-bold text-[#596861]">
        <SpeakerHigh size={16} className="text-[#2f755f]" />Voice
        <select value={selectedVoiceId} onChange={(event) => chooseVoice(event.target.value)} className="rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm">
          {elevenLabsVoices.map((voice) => <option key={voice.voiceId} value={voice.voiceId}>{voice.name}</option>)}
        </select>
        <span className="text-xs font-medium text-[#819087]">ElevenLabs · this voice plays every clip below</span>
      </label>}

      {activeTab === "conversation" ? <>
        <ConversationImport />
        {library.conversationSessions.length > 1 && <label className="mt-4 flex flex-wrap items-center gap-2 text-sm font-bold text-[#596861]">
          <ChatCircleDots size={16} className="text-[#2f755f]" />Pick a date
          <select value={conversationSession?.id ?? ""} onChange={(event) => chooseConversationSession(event.target.value)} className="rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm">
            {library.conversationSessions.map((item) => <option key={item.id} value={item.id}>{item.date}</option>)}
          </select>
        </label>}
        <LatestConversationReview key={conversationSession?.id ?? "empty"} items={conversationSession?.items ?? []} reviewDate={conversationSession?.date ?? null} isLatest={library.conversationSessions[0]?.id === conversationSession?.id} onPlay={playText} playingId={playing} />
      </> : review ? <>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e3e9e3] pb-6">
          <div>
            <p className="text-xs font-extrabold tracking-[0.14em] text-[#2f755f]">{review.date} · {review.level} · {review.duration} min</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">{review.title}</h2>
          </div>
          {library.reviews.length > 1 && <label className="text-sm font-bold text-[#596861]">
            <span className="sr-only">Pick a review date</span>
            <select value={review.id} onChange={(event) => chooseReview(event.target.value)} className="rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm">
              {library.reviews.map((item) => <option key={item.id} value={item.id}>{item.date}</option>)}
            </select>
          </label>}
        </div>

        <div className="mt-8">{activeTab === "history" ? (
          review.cards.length ? <ReviewCards cards={review.cards} states={cardStates} onReveal={revealCard} onSubmit={submitAttempt} onPlay={playText} playingId={playing} /> : <MarkdownReview markdown={review.markdown} />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#edf5ef] p-4 text-sm leading-6 text-[#416454]">
              <p className="font-extrabold">Listen → type → tap the eye to check</p>
              <p className="mt-1">Don&apos;t look at the English yet — write what you hear, then reveal the text to compare. Drafts stay on this page and aren&apos;t submitted.</p>
            </div>
            {audioNotice && <div role="status" className="rounded-xl bg-[#fffaf0] p-4 text-sm leading-6 text-[#80631c]">{audioNotice}</div>}
            <span className="sr-only" aria-live="polite">{playing ? "Audio playing" : "Audio finished"}</span>

            {(() => {
              const story = storyByReview[review.id] ?? "";
              const storyKey = JSON.stringify([review.id, "story"]);
              const storyTranscriptVisible = visibleAudioTranscripts[storyKey] ?? false;
              const storyDraft = audioDrafts[storyKey] ?? "";
              const storyInputId = `audio-draft-${review.id}-story`;
              const storyTranscriptId = `audio-transcript-${review.id}-story`;
              return <article className="rounded-xl border border-[#c8d5cd] bg-[#f7fbf8] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold tracking-[0.1em] text-[#2f755f]">STORY · Today&apos;s review words</p>
                    <p className="mt-1 text-sm leading-6 text-[#4d5f57]">A short story woven from the words you have due for review. Generate it, listen, and write down what you hear.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => generateStory(review.id)}
                    disabled={storyBusy}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#172223] px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#2d3c3c] active:translate-y-px disabled:opacity-50"
                  >
                    {storyBusy ? "Writing a story…" : story ? "New story" : "Generate a story"}
                  </button>
                </div>

                {storyError && <p role="alert" className="mt-3 rounded-lg bg-[#fff1ee] px-3 py-2 text-sm font-bold text-[#944c3f]">{storyError}</p>}

                {story && <>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" aria-label="Play the story at normal speed" title="Normal speed" onClick={() => playText(`${review.id}:story:normal`, story, 1)} className="grid size-10 place-items-center rounded-xl bg-[#172223] text-white transition hover:bg-[#2d3c3c] active:translate-y-px"><Play size={17} weight="fill" /></button>
                    <button type="button" aria-label="Play the story at slow speed" title="Slow speed" onClick={() => playText(`${review.id}:story:slow`, story, 0.75)} className="flex h-10 items-center gap-1.5 rounded-xl border border-[#b9c9bf] px-3 text-xs font-bold text-[#315f4f] transition hover:bg-[#edf5ef] active:translate-y-px"><SpeakerHigh size={16} />0.75×</button>
                    <button
                      type="button"
                      aria-label={storyTranscriptVisible ? "Hide story text" : "Show story text"}
                      aria-expanded={storyTranscriptVisible}
                      aria-controls={storyTranscriptId}
                      onClick={() => setVisibleAudioTranscripts((current) => ({ ...current, [storyKey]: !storyTranscriptVisible }))}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#c8d5cd] bg-white px-3 py-2 text-xs font-extrabold text-[#315f4f] transition hover:bg-[#edf5ef]"
                    >
                      {storyTranscriptVisible ? <EyeSlash size={16} /> : <Eye size={16} />}
                      {storyTranscriptVisible ? "Hide text" : "Show text"}
                    </button>
                  </div>

                  <label htmlFor={storyInputId} className="mt-5 block text-sm font-extrabold text-[#41514b]">Write what you hear</label>
                  <textarea
                    id={storyInputId}
                    value={storyDraft}
                    onChange={(event) => setAudioDrafts((current) => ({ ...current, [storyKey]: event.target.value }))}
                    rows={4}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="Write it from listening first, then tap “Show text” to check…"
                    className="mt-2 w-full resize-y rounded-xl border border-[#cfd9d2] bg-[#fbfcfa] px-3.5 py-3 text-sm leading-6 text-[#172223] outline-none transition placeholder:text-[#617068] focus:border-[#4e8a70] focus:ring-2 focus:ring-[#4e8a70]/15"
                  />

                  <div id={storyTranscriptId} className={`mt-4 rounded-xl border px-4 py-3 ${storyTranscriptVisible ? "border-[#b8d2c2] bg-[#f1f8f3]" : "border-dashed border-[#dce4dc] bg-[#fafbf9]"}`}>
                    {storyTranscriptVisible ? <>
                      <p className="text-xs font-extrabold tracking-[0.1em] text-[#2f755f]">Story text</p>
                      <p className="mt-2 text-base font-bold leading-7 text-[#172223]">{story}</p>
                    </> : <p className="text-sm leading-6 text-[#596861]">Story text hidden. When you&apos;re done, tap “Show text” to check.</p>}
                  </div>
                </>}
              </article>;
            })()}
            {review.audioCards.map((card, index) => {
              const stateKey = JSON.stringify([review.id, card.id]);
              const normalPlaybackId = `${stateKey}:normal`;
              const slowPlaybackId = `${stateKey}:slow`;
              const transcriptId = `audio-transcript-${review.id}-${index}`;
              const inputId = `audio-draft-${review.id}-${index}`;
              const transcriptVisible = visibleAudioTranscripts[stateKey] ?? false;
              const draft = audioDrafts[stateKey] ?? "";

              return <article key={stateKey} className="rounded-xl border border-[#dce4dc] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-xs font-extrabold text-[#2f755f]">{String(index + 1).padStart(2, "0")} · {card.prompt}</p>
                  <button
                    type="button"
                    aria-label={transcriptVisible ? "Hide English text" : "Show English text"}
                    aria-expanded={transcriptVisible}
                    aria-controls={transcriptId}
                    title={transcriptVisible ? "Hide English text" : "Show the English text to check"}
                    onClick={() => setVisibleAudioTranscripts((current) => ({ ...current, [stateKey]: !transcriptVisible }))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#c8d5cd] bg-white px-3 py-2 text-xs font-extrabold text-[#315f4f] transition hover:bg-[#edf5ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f755f]"
                  >
                    {transcriptVisible ? <EyeSlash size={16} /> : <Eye size={16} />}
                    {transcriptVisible ? "Hide text" : "Show text"}
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" aria-label="Play at normal speed" title="Normal speed" onClick={() => playAudio(normalPlaybackId, review.id, card.id, "normal", card.normal, 1)} className="grid size-10 place-items-center rounded-xl bg-[#172223] text-white transition hover:bg-[#2d3c3c] active:translate-y-px"><Play size={17} weight="fill" /></button>
                  <button type="button" aria-label="Play at slow speed" title="Slow speed" onClick={() => playAudio(slowPlaybackId, review.id, card.id, "slow", card.slow || card.normal, 0.75)} className="flex h-10 items-center gap-1.5 rounded-xl border border-[#b9c9bf] px-3 text-xs font-bold text-[#315f4f] transition hover:bg-[#edf5ef] active:translate-y-px"><SpeakerHigh size={16} />0.75×</button>
                </div>

                <label htmlFor={inputId} className="mt-5 block text-sm font-extrabold text-[#41514b]">Write what you hear</label>
                <textarea
                  id={inputId}
                  value={draft}
                  onChange={(event) => setAudioDrafts((current) => ({ ...current, [stateKey]: event.target.value }))}
                  rows={3}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  placeholder="Write it from listening first, then tap the eye at the top-right to check…"
                  className="mt-2 w-full resize-y rounded-xl border border-[#cfd9d2] bg-[#fbfcfa] px-3.5 py-3 text-sm leading-6 text-[#172223] outline-none transition placeholder:text-[#617068] focus:border-[#4e8a70] focus:ring-2 focus:ring-[#4e8a70]/15"
                />

                <div id={transcriptId} className={`mt-4 rounded-xl border px-4 py-3 ${transcriptVisible ? "border-[#b8d2c2] bg-[#f1f8f3]" : "border-dashed border-[#dce4dc] bg-[#fafbf9]"}`}>
                  {transcriptVisible ? <>
                    <p className="text-xs font-extrabold tracking-[0.1em] text-[#2f755f]">English text</p>
                    <p className="mt-2 text-base font-bold leading-7 text-[#172223]">{card.normal}</p>
                  </> : <p className="text-sm leading-6 text-[#596861]">English text hidden. When you&apos;re done, tap the eye at the top-right to check.</p>}
                </div>
              </article>;
            })}
          </div>
        )}</div>
      </> : <div className="py-16 text-center"><p className="text-lg font-black">No daily review for this category yet</p><p className="mt-2 text-sm text-[#718078]">It&apos;ll show up here once the Worker pushes the next review pack.</p></div>}
    </section>
    </div>
  </>;
}
