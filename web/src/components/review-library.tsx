"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

export type ReviewLibraryData = {
  id: string;
  name: string;
  reviews: Review[];
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
  incorrect: "答错",
  partial: "模糊",
  correct: "答对",
};

const statusLabels: Record<string, string> = {
  learning: "学习中",
  reviewing: "巩固中",
  mastered: "已掌握",
  pending_confirmation: "待确认",
};

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

function formatDueDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : value;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 3 18 18M10.6 6.1A9.5 9.5 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.2 2.8M6.2 7.2C3.8 9 2.5 12 2.5 12s3.5 6 9.5 6c1.2 0 2.3-.2 3.3-.6M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
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
function parseRichAnswer(card: ReviewCardData): RichAnswer {
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

function ReviewCards({
  cards,
  states,
  onReveal,
  onSubmit,
  sessionAnsweredItemIds,
}: {
  cards: ReviewCardData[];
  states: Record<string, CardState>;
  onReveal: (reviewItemId: string) => void;
  onSubmit: (card: ReviewCardData, result: AttemptResult) => void;
  sessionAnsweredItemIds: ReadonlySet<string>;
}) {
  return <div className="space-y-4">
    <div className="rounded-xl bg-[#edf5ef] p-4 text-sm leading-6 text-[#416454]">
      今天共 {cards.length} 题。先在心里说出答案，再点“查看答案”并如实自评；系统会据此安排下一次复习。
    </div>
    {cards.map((card, index) => {
      const state = states[card.reviewItemId] ?? {};
      const savedResult = state.result ?? card.gradedResult ?? undefined;
      const isStale = !savedResult
        && (card.stale || state.stale || sessionAnsweredItemIds.has(card.learningItemId));
      const nextDue = state.nextDue ?? card.nextDue;
      const stage = state.stage ?? card.stage;
      const status = state.status ?? card.status;
      const titleId = `review-card-${card.reviewItemId}`;
      const richAnswer = parseRichAnswer(card);

      return <article key={card.reviewItemId} aria-labelledby={titleId} aria-busy={state.submitting || undefined} className="rounded-2xl border border-[#dce4dc] bg-[#fcfdfb] p-5 sm:p-6">
        <p className="text-xs font-extrabold tracking-[0.12em] text-[#2f755f]">第 {index + 1} 题 / 共 {cards.length} 题</p>
        <h3 id={titleId} className="mt-3 text-lg font-black leading-8 text-[#172223]">{card.cue}</h3>

        {!state.revealed ? (
          <button
            type="button"
            aria-expanded="false"
            onClick={() => onReveal(card.reviewItemId)}
            className="mt-5 rounded-lg bg-[#172223] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#2d3c3c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f755f]"
          >
            {savedResult || isStale ? "查看答案与复习状态" : "查看答案"}
          </button>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="overflow-hidden rounded-xl border border-[#dce4dc] bg-white">
              <section className="p-4 sm:p-5" aria-labelledby={`${titleId}-meaning`}>
                <p id={`${titleId}-meaning`} className="text-xs font-extrabold tracking-[0.12em] text-[#6b7b74]">核心含义</p>
                <p className="mt-2 whitespace-pre-wrap text-base font-bold leading-7 text-[#172223]">{richAnswer.meaning}</p>
              </section>

              {richAnswer.explanation && <section className="border-t border-[#e3e9e3] bg-[#fbfcfa] p-4 sm:p-5" aria-labelledby={`${titleId}-explanation`}>
                <p id={`${titleId}-explanation`} className="text-xs font-extrabold tracking-[0.12em] text-[#6b7b74]">这样理解</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#41514b]">{richAnswer.explanation}</p>
              </section>}

              {richAnswer.examples.length > 0 && <section className="border-t border-[#e3e9e3] p-4 sm:p-5" aria-labelledby={`${titleId}-examples`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p id={`${titleId}-examples`} className="text-xs font-extrabold tracking-[0.12em] text-[#6b7b74]">生活场景</p>
                  <p className="text-xs font-semibold text-[#819087]">共 {richAnswer.examples.length} 个</p>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {richAnswer.examples.map((example, exampleIndex) => <article key={`${example.english}-${exampleIndex}`} className="rounded-xl bg-[#f3f7f2] p-4">
                    <p className="text-xs font-extrabold text-[#2f755f]">{example.scenario ?? `场景 ${exampleIndex + 1}`}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#172223]">{example.english}</p>
                    {example.chinese && <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-[#627169]">{example.chinese}</p>}
                  </article>)}
                </div>
              </section>}

              {richAnswer.usageTip && <section className="border-t border-[#e3e9e3] bg-[#fffaf0] p-4 sm:p-5" aria-labelledby={`${titleId}-usage-tip`}>
                <p id={`${titleId}-usage-tip`} className="text-xs font-extrabold tracking-[0.12em] text-[#80631c]">使用提醒</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#5f512d]">{richAnswer.usageTip}</p>
              </section>}
            </div>

            {savedResult ? (
              <div role="status" className="rounded-xl bg-[#edf5ef] p-4 text-sm leading-6 text-[#315f4f]">
                <p className="font-extrabold">已记录：{resultLabels[savedResult]}</p>
                <p className="mt-1">下次复习：{formatDueDate(nextDue)} · 阶段 {stage} · {statusLabels[status] ?? status}</p>
              </div>
            ) : isStale ? (
              <div role="status" className="rounded-xl bg-[#f3f4ef] p-4 text-sm leading-6 text-[#59645e]">
                <p className="font-extrabold">这道旧题不再计入排期</p>
                <p className="mt-1">你已经在更新的题卡中完成了这个知识点；这里仍可查看答案，但不能重复推进复习阶段。</p>
              </div>
            ) : (
              <fieldset disabled={state.submitting}>
                <legend className="text-sm font-extrabold text-[#41514b]">这次回忆得怎么样？</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => onSubmit(card, "incorrect")} className="rounded-lg border border-[#e2b7ad] bg-[#fff8f6] px-4 py-2.5 text-sm font-bold text-[#944c3f] transition hover:bg-[#fcebe7] disabled:cursor-wait disabled:opacity-55">答错 · 明天再来</button>
                  <button type="button" onClick={() => onSubmit(card, "partial")} className="rounded-lg border border-[#dec991] bg-[#fffaf0] px-4 py-2.5 text-sm font-bold text-[#80631c] transition hover:bg-[#fbf1d6] disabled:cursor-wait disabled:opacity-55">模糊 · 稍后巩固</button>
                  <button type="button" onClick={() => onSubmit(card, "correct")} className="rounded-lg border border-[#a9cbb7] bg-[#f1faf4] px-4 py-2.5 text-sm font-bold text-[#286247] transition hover:bg-[#e2f3e8] disabled:cursor-wait disabled:opacity-55">答对 · 延长间隔</button>
                </div>
                {state.submitting && <p aria-live="polite" className="mt-3 text-sm font-bold text-[#4e8a70]">正在保存评分…</p>}
              </fieldset>
            )}
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
}: {
  libraries: ReviewLibraryData[];
  loadWarning?: boolean;
}) {
  const [libraryId, setLibraryId] = useState(libraries[0]?.id ?? "");
  const [reviewId, setReviewId] = useState(libraries[0]?.reviews[0]?.id ?? "");
  const [mode, setMode] = useState<"text" | "audio">("text");
  const [playing, setPlaying] = useState("");
  const [audioNotice, setAudioNotice] = useState("");
  const [visibleAudioTranscripts, setVisibleAudioTranscripts] = useState<Record<string, boolean>>({});
  const [audioDrafts, setAudioDrafts] = useState<Record<string, string>>({});
  const [cardStates, setCardStates] = useState<Record<string, CardState>>({});
  const objectUrlsRef = useRef(new Map<string, string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const submittingIdsRef = useRef(new Set<string>());
  const completedIdsRef = useRef(new Set<string>());
  const completedLearningItemIdsRef = useRef(new Set<string>());
  const [sessionAnsweredItemIds, setSessionAnsweredItemIds] = useState<Set<string>>(() => new Set());

  const library = libraries.find((item) => item.id === libraryId) ?? libraries[0];
  const review = useMemo(
    () => library?.reviews.find((item) => item.id === reviewId) ?? library?.reviews[0],
    [library, reviewId],
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
    setMode("text");
  }

  function chooseMode(nextMode: "text" | "audio") {
    if (nextMode !== "audio") cancelPlayback();
    setMode(nextMode);
  }

  function chooseLibrary(id: string) {
    const next = libraries.find((item) => item.id === id);
    resetReviewState();
    setLibraryId(id);
    setReviewId(next?.reviews[0]?.id ?? "");
  }

  function chooseReview(id: string) {
    resetReviewState();
    setReviewId(id);
  }

  function revealCard(reviewItemId: string) {
    setCardStates((current) => ({
      ...current,
      [reviewItemId]: { ...current[reviewItemId], revealed: true },
    }));
  }

  async function submitAttempt(card: ReviewCardData, result: AttemptResult) {
    if (
      submittingIdsRef.current.has(card.reviewItemId)
      || completedIdsRef.current.has(card.reviewItemId)
      || completedLearningItemIdsRef.current.has(card.learningItemId)
      || card.gradedResult
      || card.stale
    ) return;

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
        throw new Error(payload?.message ?? "评分保存失败，请稍后重试。");
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
      completedIdsRef.current.add(card.reviewItemId);
      completedLearningItemIdsRef.current.add(card.learningItemId);
      setSessionAnsweredItemIds((current) => {
        const next = new Set(current);
        next.add(card.learningItemId);
        return next;
      });
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
          error: error instanceof Error ? error.message : "评分保存失败，请稍后重试。",
        },
      }));
    } finally {
      submittingIdsRef.current.delete(card.reviewItemId);
    }
  }

  async function playAudio(playbackId: string, sourceReviewId: string, cardId: string, variant: "normal" | "slow", fallbackText: string, speed: 1 | 0.75) {
    cancelPlayback();
    const sequence = playbackSequenceRef.current;
    const cacheKey = JSON.stringify([sourceReviewId, cardId, variant, speed]);
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
      setAudioNotice("ElevenLabs 本次未能生成语音，已切换到浏览器英语语音。请在设置中检查密钥或额度。");
      speak(fallbackText, speed, finish);
    };

    try {
      let objectUrl = objectUrlsRef.current.get(cacheKey);
      if (!objectUrl) {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewId: sourceReviewId, cardId, variant, speed }),
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
      audioRef.current = audio;
      audio.onended = finish;
      audio.onerror = fallbackToBrowser;
      await audio.play();
    } catch {
      fallbackToBrowser();
    }
  }

  if (!library) return null;

  return <>
    {loadWarning && <div role="alert" className="mt-8 rounded-xl border border-[#dec991] bg-[#fffaf0] p-4 text-sm leading-6 text-[#80631c]">部分结构化复习数据暂时无法读取，旧内容仍可查看。请稍后刷新；若持续出现，请检查数据库迁移与服务日志。</div>}
    <div className={`${loadWarning ? "mt-4" : "mt-8"} grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]`}>
    <aside className="h-fit rounded-2xl border border-[#dce4dc] bg-[#f8faf7] p-3">
      <p className="px-3 pb-2 text-xs font-extrabold tracking-[0.14em] text-[#6b7b74]">现有分类</p>
      <div className="space-y-2">{libraries.map((item) => <button key={item.id} type="button" onClick={() => chooseLibrary(item.id)} className={`w-full rounded-xl px-3 py-3 text-left text-sm font-extrabold transition ${item.id === library.id ? "bg-[#172223] text-white" : "text-[#41514b] hover:bg-white"}`}>{item.name}<span className={`mt-1 block text-xs font-medium ${item.id === library.id ? "text-white/60" : "text-[#819087]"}`}>{item.reviews.length ? `${item.reviews.length} 份复习` : "等待复习内容"}</span></button>)}</div>
    </aside>

    <section className="min-w-0 rounded-2xl border border-[#dce4dc] bg-white p-5 sm:p-8">
      {review ? <>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e3e9e3] pb-6">
          <div>
            <p className="text-xs font-extrabold tracking-[0.14em] text-[#2f755f]">{review.date} · {review.level} · {review.duration} 分钟</p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">{review.title}</h2>
          </div>
          {library.reviews.length > 1 && <label className="text-sm font-bold text-[#596861]">
            <span className="sr-only">选择复习日期</span>
            <select value={review.id} onChange={(event) => chooseReview(event.target.value)} className="rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm">
              {library.reviews.map((item) => <option key={item.id} value={item.id}>{item.date}</option>)}
            </select>
          </label>}
        </div>

        <div className="mt-6 flex gap-2 rounded-xl bg-[#f3f6f2] p-1.5" role="group" aria-label="复习模式">
          <button type="button" aria-pressed={mode === "text"} onClick={() => chooseMode("text")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-extrabold ${mode === "text" ? "bg-white text-[#172223] shadow-sm" : "text-[#718078]"}`}>文字复习</button>
          <button type="button" aria-pressed={mode === "audio"} onClick={() => chooseMode("audio")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-extrabold ${mode === "audio" ? "bg-white text-[#172223] shadow-sm" : "text-[#718078]"}`}>听力与跟读 · {review.audioCards.length}</button>
        </div>

        <div className="mt-8">{mode === "text" ? (
          review.cards.length ? <ReviewCards cards={review.cards} states={cardStates} onReveal={revealCard} onSubmit={submitAttempt} sessionAnsweredItemIds={sessionAnsweredItemIds} /> : <MarkdownReview markdown={review.markdown} />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#edf5ef] p-4 text-sm leading-6 text-[#416454]">
              <p className="font-extrabold">先听 → 输入 → 点眼睛核对</p>
              <p className="mt-1">先不要看英文，写下你听到的内容，再显示原文对照。草稿只保留在当前页面，不会提交评分。</p>
            </div>
            {audioNotice && <div role="status" className="rounded-xl bg-[#fffaf0] p-4 text-sm leading-6 text-[#80631c]">{audioNotice}</div>}
            <span className="sr-only" aria-live="polite">{playing ? "正在播放音频" : "音频播放结束"}</span>
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
                    aria-label={transcriptVisible ? "隐藏英文原文" : "显示英文原文"}
                    aria-expanded={transcriptVisible}
                    aria-controls={transcriptId}
                    title={transcriptVisible ? "隐藏英文原文" : "显示英文原文并核对"}
                    onClick={() => setVisibleAudioTranscripts((current) => ({ ...current, [stateKey]: !transcriptVisible }))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#c8d5cd] bg-white px-3 py-2 text-xs font-extrabold text-[#315f4f] transition hover:bg-[#edf5ef] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f755f]"
                  >
                    <EyeIcon open={transcriptVisible} />
                    {transcriptVisible ? "隐藏原文" : "显示原文"}
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => playAudio(normalPlaybackId, review.id, card.id, "normal", card.normal, 1)} className="rounded-lg bg-[#172223] px-4 py-2 text-sm font-bold text-white">{playing === normalPlaybackId ? "正在播放…" : "▶ 正常语速"}</button>
                  <button type="button" onClick={() => playAudio(slowPlaybackId, review.id, card.id, "slow", card.slow || card.normal, 0.75)} className="rounded-lg border border-[#b9c9bf] px-4 py-2 text-sm font-bold text-[#315f4f]">{playing === slowPlaybackId ? "正在播放…" : "慢速跟读"}</button>
                </div>

                <label htmlFor={inputId} className="mt-5 block text-sm font-extrabold text-[#41514b]">写下你听到的英文</label>
                <textarea
                  id={inputId}
                  value={draft}
                  onChange={(event) => setAudioDrafts((current) => ({ ...current, [stateKey]: event.target.value }))}
                  rows={3}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  placeholder="先凭听力写下来，再点右上角眼睛核对…"
                  className="mt-2 w-full resize-y rounded-xl border border-[#cfd9d2] bg-[#fbfcfa] px-3.5 py-3 text-sm leading-6 text-[#172223] outline-none transition placeholder:text-[#617068] focus:border-[#4e8a70] focus:ring-2 focus:ring-[#4e8a70]/15"
                />

                <div id={transcriptId} className={`mt-4 rounded-xl border px-4 py-3 ${transcriptVisible ? "border-[#b8d2c2] bg-[#f1f8f3]" : "border-dashed border-[#dce4dc] bg-[#fafbf9]"}`}>
                  {transcriptVisible ? <>
                    <p className="text-xs font-extrabold tracking-[0.1em] text-[#2f755f]">英文原文</p>
                    <p className="mt-2 text-base font-bold leading-7 text-[#172223]">{card.normal}</p>
                  </> : <p className="text-sm leading-6 text-[#596861]">英文原文已隐藏。输入完成后，点右上角眼睛核对。</p>}
                </div>
              </article>;
            })}
          </div>
        )}</div>
      </> : <div className="py-16 text-center"><p className="text-lg font-black">这个分类还没有每日复习</p><p className="mt-2 text-sm text-[#718078]">Worker 推送下一份复习包后会显示在这里。</p></div>}
    </section>
    </div>
  </>;
}
