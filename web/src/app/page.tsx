import Link from "next/link";

const steps = [
  ["01", "Keep chatting in ChatGPT", "English, investing, or any topic—keep the smooth chat experience you already love."],
  ["02", "Worker pushes securely", "Your local Worker curates valuable chat snippets, then pushes them to your remote knowledge base via API."],
  ["03", "Sign in to review anytime", "Review key takeaways, missed questions, expressions, and voice cards by knowledge space."],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f7f2] px-5 py-8 text-[#172223] sm:px-10 lg:px-20">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <span className="text-lg font-black tracking-tight">Chat Review</span>
        <span className="rounded-full border border-[#d5ddd7] bg-white px-3 py-1 text-xs font-semibold text-[#4b625a]">Phase 1 · Worker Push</span>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div>
          <p className="mb-4 text-sm font-bold tracking-[0.18em] text-[#4e8a70]">YOUR CHAT-BASED KNOWLEDGE BASE</p>
          <h1 className="max-w-[720px] text-[clamp(2.7rem,5vw,5.1rem)] font-black leading-[1.06] tracking-[-0.055em] text-[#172223]">Turn conversations<br /><span className="text-[#315547]">into knowledge.</span></h1>
          <p className="mt-5 text-base font-semibold text-[#4e8a70]">Turn every chat into knowledge you can review anytime.</p>
          <p className="mt-5 max-w-xl text-[1.05rem] leading-8 text-[#53645d]">Use ChatGPT as usual. Your local Worker securely pushes worthwhile English, investing, or other content to your online knowledge base.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/login" className="rounded-full bg-[#172223] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#315547]">Sign in to start reviewing</Link>
            <span className="rounded-full border border-[#d5ddd7] bg-white px-5 py-3 text-sm font-semibold text-[#52635c]">Data connection ready</span>
          </div>
        </div>

        <aside className="rounded-[2rem] bg-[#172223] p-6 text-white shadow-2xl shadow-[#172223]/15 sm:p-8">
          <div className="flex items-center justify-between text-sm text-[#b8d0c3]"><span>Today&apos;s review</span><span>8–12 min</span></div>
          <div className="mt-9 rounded-2xl bg-[#edf6ed] p-6 text-[#172223]"><p className="text-sm font-bold text-[#4e8a70]">ACTIVE RECALL</p><p className="mt-4 text-2xl font-black leading-snug">Why does diversification reduce portfolio risk?</p><div className="mt-7 flex gap-2"><span className="rounded-full bg-[#d7ebdc] px-3 py-1 text-xs font-bold">Investing</span><span className="rounded-full bg-[#d7ebdc] px-3 py-1 text-xs font-bold">English</span></div></div>
          <p className="mt-6 text-sm leading-6 text-[#b8d0c3]">Once live, this shows due review items and last sync status by knowledge space.</p>
        </aside>
      </section>

      <section className="mx-auto max-w-6xl border-t border-[#d5ddd7] py-12"><p className="text-sm font-bold tracking-[0.14em] text-[#4e8a70]">HOW IT WORKS</p><div className="mt-6 grid gap-4 md:grid-cols-3">{steps.map(([number, title, description]) => <article key={number} className="rounded-2xl border border-[#dce2dc] bg-white p-6"><p className="text-sm font-black text-[#4e8a70]">{number}</p><h2 className="mt-8 text-xl font-black">{title}</h2><p className="mt-3 leading-7 text-[#596861]">{description}</p></article>)}</div></section>
    </main>
  );
}
