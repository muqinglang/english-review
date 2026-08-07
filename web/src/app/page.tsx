const steps = [
  ["01", "在 ChatGPT 练习", "继续使用 englishTranning 项目，不需要改变你的聊天习惯。"],
  ["02", "Worker 安全推送", "本机 Worker 按提示词整理学习证据，并通过 API 推送到远程学习库。"],
  ["03", "随时登录复习", "在线回顾错题、今日练习和英语声音卡片。"],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f7f2] px-5 py-8 text-[#172223] sm:px-10 lg:px-20">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <span className="text-lg font-black tracking-tight">English Review</span>
        <span className="rounded-full border border-[#d5ddd7] bg-white px-3 py-1 text-xs font-semibold text-[#4b625a]">
          Phase 1 · Worker Push
        </span>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-10 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <p className="mb-4 text-sm font-bold tracking-[0.18em] text-[#4e8a70]">PERSONAL ENGLISH PRACTICE</p>
          <h1 className="max-w-3xl text-5xl font-black leading-[1.05] tracking-[-0.06em] sm:text-7xl">
            把每次聊天，
            <br />
            变成下一次开口的底气。
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#53645d]">
            你照常在 ChatGPT 练英语。本机 Worker 自动整理错误、词汇和发音难点，安全推送到你的线上复习库。
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <button className="rounded-full bg-[#172223] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#315547]">
              登录后开始复习
            </button>
            <span className="rounded-full border border-[#d5ddd7] bg-white px-5 py-3 text-sm font-semibold text-[#52635c]">
              数据连接准备中
            </span>
          </div>
        </div>

        <aside className="rounded-[2rem] bg-[#172223] p-6 text-white shadow-2xl shadow-[#172223]/15 sm:p-8">
          <div className="flex items-center justify-between text-sm text-[#b8d0c3]">
            <span>今日复习</span><span>8–12 分钟</span>
          </div>
          <div className="mt-9 rounded-2xl bg-[#edf6ed] p-6 text-[#172223]">
            <p className="text-sm font-bold text-[#4e8a70]">ACTIVE RECALL</p>
            <p className="mt-4 text-2xl font-black leading-snug">What does “wrestle with” mean?</p>
            <div className="mt-7 flex gap-2">
              <span className="rounded-full bg-[#d7ebdc] px-3 py-1 text-xs font-bold">正常朗读</span>
              <span className="rounded-full bg-[#d7ebdc] px-3 py-1 text-xs font-bold">慢速跟读</span>
            </div>
          </div>
          <p className="mt-6 text-sm leading-6 text-[#b8d0c3]">上线后，这里会显示你的真实到期复习项和最后同步状态。</p>
        </aside>
      </section>

      <section className="mx-auto max-w-6xl border-t border-[#d5ddd7] py-12">
        <p className="text-sm font-bold tracking-[0.14em] text-[#4e8a70]">HOW IT WORKS</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map(([number, title, description]) => (
            <article key={number} className="rounded-2xl border border-[#dce2dc] bg-white p-6">
              <p className="text-sm font-black text-[#4e8a70]">{number}</p>
              <h2 className="mt-8 text-xl font-black">{title}</h2>
              <p className="mt-3 leading-7 text-[#596861]">{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
