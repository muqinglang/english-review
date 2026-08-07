import Link from "next/link";

const steps = [
  ["01", "继续在 ChatGPT 聊天", "英语、投资或其他主题，都保留你原本顺滑的聊天体验。"],
  ["02", "Worker 安全推送", "本机 Worker 整理有价值的聊天片段，再通过 API 推送到远程知识库。"],
  ["03", "随时登录回顾", "按知识库复习关键结论、错题、表达和声音卡片。"],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f7f2] px-5 py-8 text-[#172223] sm:px-10 lg:px-20">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <span className="text-lg font-black tracking-tight">Chat Review</span>
        <span className="rounded-full border border-[#d5ddd7] bg-white px-3 py-1 text-xs font-semibold text-[#4b625a]">Phase 1 · Worker Push</span>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-10 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-bold tracking-[0.18em] text-[#4e8a70]">YOUR CHAT-BASED KNOWLEDGE BASE</p>
          <h1 className="max-w-3xl text-5xl font-black leading-[1.05] tracking-[-0.06em] sm:text-7xl">把每次聊天，<br />变成随时可回顾的知识。</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#53645d]">你照常使用 ChatGPT。本机 Worker 把值得保留的英语、投资或其他主题内容，安全推送到你的线上知识库。</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/login" className="rounded-full bg-[#172223] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#315547]">登录后开始复习</Link>
            <span className="rounded-full border border-[#d5ddd7] bg-white px-5 py-3 text-sm font-semibold text-[#52635c]">数据连接已就绪</span>
          </div>
        </div>

        <aside className="rounded-[2rem] bg-[#172223] p-6 text-white shadow-2xl shadow-[#172223]/15 sm:p-8">
          <div className="flex items-center justify-between text-sm text-[#b8d0c3]"><span>今日回顾</span><span>8–12 分钟</span></div>
          <div className="mt-9 rounded-2xl bg-[#edf6ed] p-6 text-[#172223]"><p className="text-sm font-bold text-[#4e8a70]">ACTIVE RECALL</p><p className="mt-4 text-2xl font-black leading-snug">Why does diversification reduce portfolio risk?</p><div className="mt-7 flex gap-2"><span className="rounded-full bg-[#d7ebdc] px-3 py-1 text-xs font-bold">投资知识库</span><span className="rounded-full bg-[#d7ebdc] px-3 py-1 text-xs font-bold">英语知识库</span></div></div>
          <p className="mt-6 text-sm leading-6 text-[#b8d0c3]">上线后，这里会按知识库显示到期回顾项和最后同步状态。</p>
        </aside>
      </section>

      <section className="mx-auto max-w-6xl border-t border-[#d5ddd7] py-12"><p className="text-sm font-bold tracking-[0.14em] text-[#4e8a70]">HOW IT WORKS</p><div className="mt-6 grid gap-4 md:grid-cols-3">{steps.map(([number, title, description]) => <article key={number} className="rounded-2xl border border-[#dce2dc] bg-white p-6"><p className="text-sm font-black text-[#4e8a70]">{number}</p><h2 className="mt-8 text-xl font-black">{title}</h2><p className="mt-3 leading-7 text-[#596861]">{description}</p></article>)}</div></section>
    </main>
  );
}
