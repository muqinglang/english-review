"use client";

import { useState } from "react";

export function WorkerTokenPanel() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function createToken() {
    setBusy(true); setError("");
    const response = await fetch("/api/worker/device", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: "My local Worker" }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.message ?? "无法创建令牌。"); return; }
    setToken(body.token);
  }
  return <section className="mt-8 rounded-xl border border-[#dce2dc] bg-[#f7f7f2] p-5"><h2 className="font-black">连接本机 Worker</h2><p className="mt-2 text-sm leading-6 text-[#596861]">生成一次性令牌后，将它保存到本机 Worker 配置。令牌只显示一次。</p>{token ? <code className="mt-4 block break-all rounded-lg bg-[#172223] p-3 text-sm text-white">{token}</code> : <button onClick={createToken} disabled={busy} className="mt-4 rounded-lg bg-[#172223] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? "正在生成…" : "生成 Worker 令牌"}</button>}{error && <p className="mt-3 text-sm text-red-700">{error}</p>}</section>;
}
