"use client";

import { useMemo, useState } from "react";

type AudioCard = { id: string; prompt: string; normal: string; slow?: string };
type Review = { id: string; date: string; title: string; markdown: string; duration: string; level: string; audioCards: AudioCard[] };
export type ReviewLibraryData = { id: string; name: string; reviews: Review[] };

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return <>{parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index} className="rounded bg-[#edf3ed] px-1.5 py-0.5 font-mono text-[0.92em] text-[#245f4d]">{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index} className="font-extrabold text-[#172223]">{part.slice(2, -2)}</strong>;
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
    if (numbered) return <div key={index} className="flex gap-3"><span className="mt-0.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#dff0e4] text-xs font-black text-[#2f755f]">{numbered[1]}</span><p><InlineText text={numbered[2]} /></p></div>;
    if (line.startsWith("- ")) return <div key={index} className="flex gap-3 pl-2"><span className="text-[#62a181]">•</span><p><InlineText text={line.slice(2)} /></p></div>;
    return <p key={index}><InlineText text={line} /></p>;
  })}</div>;
}

function speak(text: string, rate: number, onEnd?: () => void) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("en-us")) ?? window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("en"));
  if (voice) utterance.voice = voice;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
}

export function ReviewLibrary({ libraries }: { libraries: ReviewLibraryData[] }) {
  const [libraryId, setLibraryId] = useState(libraries[0]?.id ?? "");
  const [reviewId, setReviewId] = useState(libraries[0]?.reviews[0]?.id ?? "");
  const [mode, setMode] = useState<"text" | "audio">("text");
  const [playing, setPlaying] = useState("");
  const library = libraries.find((item) => item.id === libraryId) ?? libraries[0];
  const review = useMemo(() => library?.reviews.find((item) => item.id === reviewId) ?? library?.reviews[0], [library, reviewId]);

  function chooseLibrary(id: string) {
    const next = libraries.find((item) => item.id === id);
    setLibraryId(id);
    setReviewId(next?.reviews[0]?.id ?? "");
    setMode("text");
  }

  if (!library) return null;
  return <div className="mt-8 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
    <aside className="h-fit rounded-2xl border border-[#dce4dc] bg-[#f8faf7] p-3">
      <p className="px-3 pb-2 text-xs font-extrabold tracking-[0.14em] text-[#6b7b74]">现有分类</p>
      <div className="space-y-2">{libraries.map((item) => <button key={item.id} onClick={() => chooseLibrary(item.id)} className={`w-full rounded-xl px-3 py-3 text-left text-sm font-extrabold transition ${item.id === library.id ? "bg-[#172223] text-white" : "text-[#41514b] hover:bg-white"}`}>{item.name}<span className={`mt-1 block text-xs font-medium ${item.id === library.id ? "text-white/60" : "text-[#819087]"}`}>{item.reviews.length ? `${item.reviews.length} 份复习` : "等待复习内容"}</span></button>)}</div>
    </aside>
    <section className="min-w-0 rounded-2xl border border-[#dce4dc] bg-white p-5 sm:p-8">
      {review ? <>
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e3e9e3] pb-6">
          <div><p className="text-xs font-extrabold tracking-[0.14em] text-[#2f755f]">{review.date} · {review.level} · {review.duration} 分钟</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">{review.title}</h2></div>
          {library.reviews.length > 1 && <select value={review.id} onChange={(event) => setReviewId(event.target.value)} className="rounded-lg border border-[#dce4dc] bg-white px-3 py-2 text-sm">{library.reviews.map((item) => <option key={item.id} value={item.id}>{item.date}</option>)}</select>}
        </div>
        <div className="mt-6 flex gap-2 rounded-xl bg-[#f3f6f2] p-1.5">
          <button onClick={() => setMode("text")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-extrabold ${mode === "text" ? "bg-white text-[#172223] shadow-sm" : "text-[#718078]"}`}>文字复习</button>
          <button onClick={() => setMode("audio")} className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-extrabold ${mode === "audio" ? "bg-white text-[#172223] shadow-sm" : "text-[#718078]"}`}>听力与跟读 · {review.audioCards.length}</button>
        </div>
        <div className="mt-8">{mode === "text" ? <MarkdownReview markdown={review.markdown} /> : <div className="space-y-4">
          <div className="rounded-xl bg-[#edf5ef] p-4 text-sm leading-6 text-[#416454]">先听正常语速，再听慢速，最后遮住文字跟读。语音由浏览器的英语语音引擎生成。</div>
          {review.audioCards.map((card, index) => <article key={card.id} className="rounded-xl border border-[#dce4dc] p-5"><p className="text-xs font-extrabold text-[#2f755f]">{String(index + 1).padStart(2, "0")} · {card.prompt}</p><p className="mt-3 text-base font-bold leading-7 text-[#172223]">{card.normal}</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => { setPlaying(card.id); speak(card.normal, 0.92, () => setPlaying("")); }} className="rounded-lg bg-[#172223] px-4 py-2 text-sm font-bold text-white">{playing === card.id ? "正在播放…" : "▶ 正常语速"}</button>{card.slow && <button onClick={() => { setPlaying(`${card.id}-slow`); speak(card.slow!, 0.68, () => setPlaying("")); }} className="rounded-lg border border-[#b9c9bf] px-4 py-2 text-sm font-bold text-[#315f4f]">{playing === `${card.id}-slow` ? "正在播放…" : "慢速跟读"}</button>}</div></article>)}
        </div>}</div>
      </> : <div className="py-16 text-center"><p className="text-lg font-black">这个分类还没有每日复习</p><p className="mt-2 text-sm text-[#718078]">Worker 推送下一份复习包后会显示在这里。</p></div>}
    </section>
  </div>;
}
