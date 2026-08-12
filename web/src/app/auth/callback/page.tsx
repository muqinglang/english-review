"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clearBrowserSupabaseAuthCookies, createBrowserSupabaseClient } from "@/lib/supabase/browser";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("正在完成登录…");
  useEffect(() => {
    async function finish() {
      try {
        const supabase = createBrowserSupabaseClient();
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) throw new Error("没有获得有效登录会话。");
        const response = await fetch("/api/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token }) });
        if (!response.ok) throw new Error("无法保存登录会话。");
        clearBrowserSupabaseAuthCookies();
        window.location.replace("/review");
      } catch {
        setMessage("登录验证失败。请返回登录页重新发送链接，并只点击最新的一封邮件。");
      }
    }
    finish();
  }, []);
  return <main className="flex min-h-screen items-center justify-center bg-[#f7f7f2] px-5 text-[#172223]"><section className="rounded-xl bg-white p-6 text-center shadow-lg"><p className="font-bold">{message}</p>{message !== "正在完成登录…" && <Link href="/login" className="mt-5 inline-block rounded-lg bg-[#172223] px-4 py-2 text-sm font-bold text-white">返回登录页</Link>}</section></main>;
}
