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
  ["vocabulary", "词汇"],
  ["expression", "地道表达"],
  ["error", "常见错误"],
  ["pronunciation", "发音 / 听辨"],
  ["fact", "事实"],
  ["concept", "概念"],
  ["decision", "决策"],
  ["quote", "引用"],
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
        setError(body.message ?? "无法保存学习内容。");
        return;
      }

      setResult(body as CaptureResult);
      setCue("");
      setAnswer("");
      setExample("");
    } catch {
      setError("无法连接保存服务，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }

  if (!spaces.length) {
    return (
      <section className="mt-8 rounded-2xl border border-[#dce4dc] bg-white p-8 text-center">
        <h2 className="text-xl font-black">还没有知识库</h2>
        <p className="mt-3 text-[#617068]">请先通过 Worker 建立一个知识库，再回来添加学习内容。</p>
      </section>
    );
  }

  const inputClass = "mt-2 w-full rounded-xl border border-[#cfd9d2] bg-white px-4 py-3 outline-none focus:border-[#4e8a70]";

  return (
    <section className="mt-8 rounded-2xl border border-[#dce4dc] bg-white p-6 sm:p-8">
      <div className="rounded-xl bg-[#eff7f1] p-4 text-sm leading-6 text-[#315d4c]">
        <strong>昨天聊天也可以补录：</strong>将“学习日期”设为昨天，English Tranning 里不会的内容会在今天进入复习。每次只保存一个可独立自评的知识点；若检索键已经存在，只更新内容和出现次数，不会重置原有排期。
      </div>

      <form className="mt-7 grid gap-5" onSubmit={submit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <span className="text-sm font-extrabold">知识库</span>
            <select className={inputClass} value={knowledgeSpaceId} onChange={(event) => setKnowledgeSpaceId(event.target.value)}>
              {spaces.map((space) => <option key={space.id} value={space.id}>{space.name}</option>)}
            </select>
          </label>
          <label>
            <span className="text-sm font-extrabold">学习日期（上海时区）</span>
            <input className={inputClass} type="date" max={today} required value={learnedOn} onChange={(event) => setLearnedOn(event.target.value)} />
          </label>
        </div>

        <label>
          <span className="text-sm font-extrabold">题目 / 提示</span>
          <textarea className={`${inputClass} min-h-24 resize-y`} maxLength={500} required value={cue} onChange={(event) => setCue(event.target.value)} placeholder="例如：如何区分 insist on 和 persist in？" />
        </label>

        <label>
          <span className="text-sm font-extrabold">答案</span>
          <textarea className={`${inputClass} min-h-32 resize-y`} maxLength={5000} required value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="写下简明答案或自然表达" />
        </label>

        <label>
          <span className="text-sm font-extrabold">例句（可选）</span>
          <textarea className={`${inputClass} min-h-24 resize-y`} maxLength={2000} value={example} onChange={(event) => setExample(event.target.value)} placeholder="例如：She persisted in asking for an explanation." />
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <span className="text-sm font-extrabold">类型</span>
            <select className={inputClass} value={type} onChange={(event) => setType(event.target.value)}>
              {ITEM_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span className="text-sm font-extrabold">优先级</span>
            <select className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </label>
        </div>

        <div>
          <button type="submit" disabled={busy || !knowledgeSpaceId || !cue.trim() || !answer.trim()} className="rounded-xl bg-[#172223] px-6 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "正在保存…" : "保存并安排复习"}
          </button>
        </div>
      </form>

      {result && (
        <p className="mt-5 rounded-xl bg-[#eff7f1] p-4 text-sm font-bold text-[#285e48]" role="status">
          {result.action === "created"
            ? `已新增。将在 ${result.nextDue}${result.learnedOn === today ? "（明天）" : ""}首次复习。`
            : `已更新已有条目（累计出现 ${result.occurrences} 次），原排期保持为 ${result.nextDue}。`}
        </p>
      )}
      {error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}
