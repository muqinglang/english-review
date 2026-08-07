"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    const response = await fetch("/api/auth/magic-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const body = await response.json().catch(() => ({}));
    setSubmitting(false);
    setMessage(response.ok ? "登录链接已发送，请到邮箱点击链接完成验证。" : body.message ?? "暂时无法发送登录链接，请稍后重试。");
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#f7f7f2] px-5 text-[#172223]"><section className="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-xl shadow-[#172223]/10"><Link href="/" className="text-sm font-bold text-[#4e8a70]">← English Review</Link><h1 className="mt-8 text-3xl font-black">登录你的复习库</h1><p className="mt-3 leading-7 text-[#596861]">输入邮箱，我们会发送一封一次性登录链接；无需设置密码。</p><form className="mt-8 space-y-4" onSubmit={submit}><label className="block text-sm font-bold" htmlFor="email">邮箱</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]" placeholder="you@example.com" /><button disabled={submitting} className="w-full rounded-xl bg-[#172223] px-5 py-3 font-bold text-white disabled:opacity-60">{submitting ? "正在发送…" : "发送登录链接"}</button></form>{message && <p className="mt-5 rounded-xl bg-[#edf6ed] p-4 text-sm leading-6 text-[#315547]" role="status">{message}</p>}</section></main>;
}
