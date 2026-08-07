"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type WorkerDevice = { id: string; displayName: string; createdAt: string; lastSeenAt: string | null; revokedAt: string | null };

function formatDate(value: string | null) {
  if (!value) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function WorkerTokenPanel({ devices }: { devices: WorkerDevice[] }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("My Windows Worker");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function createToken() {
    setBusy(true); setError(""); setCopied(false);
    const response = await fetch("/api/worker/device", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.message ?? "无法创建令牌。"); return; }
    setToken(body.token);
    router.refresh();
  }

  async function copyToken() {
    try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setError("无法自动复制，请手动选择令牌。") }
  }

  async function revoke(deviceId: string) {
    if (!window.confirm("撤销后，这台 Worker 将立即无法继续推送。确定撤销吗？")) return;
    setBusy(true); setError("");
    const response = await fetch("/api/worker/device", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.message ?? "无法撤销令牌。"); return; }
    router.refresh();
  }

  return <div className="space-y-8">
    <section className="rounded-2xl border border-[#dce4dc] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black">连接新的本机 Worker</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#617068]">为一台电脑生成独立令牌。令牌仅显示一次，请立即保存到本机加密配置。</p></div><span className="rounded-full bg-[#edf5ef] px-3 py-1 text-xs font-extrabold text-[#2f755f]">SERVER CREDENTIAL</span></div>
      {!token ? <div className="mt-6 flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="worker-name">设备名称</label><input id="worker-name" value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]" placeholder="例如：Home Windows PC" /><button onClick={createToken} disabled={busy || !displayName.trim()} className="rounded-xl bg-[#172223] px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "正在生成…" : "生成令牌"}</button></div> : <div className="mt-6 rounded-2xl border border-[#9fc9af] bg-[#f0f8f2] p-5"><p className="text-sm font-extrabold text-[#285e48]">令牌已生成，请立即保存</p><code className="mt-3 block break-all rounded-xl bg-[#172223] p-4 text-sm text-white">{token}</code><div className="mt-3 flex flex-wrap gap-2"><button onClick={copyToken} className="rounded-lg bg-[#2f755f] px-4 py-2 text-sm font-bold text-white">{copied ? "已复制" : "复制令牌"}</button><button onClick={() => { setToken(""); setCopied(false); }} className="rounded-lg border border-[#9fc9af] px-4 py-2 text-sm font-bold text-[#285e48]">我已保存</button></div><p className="mt-4 text-sm leading-6 text-[#456457]">在本机运行 <code className="rounded bg-white px-1.5 py-0.5">.\worker\configure-token.ps1</code>，在隐藏输入中粘贴令牌。</p></div>}
      {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    </section>
    <section className="rounded-2xl border border-[#dce4dc] bg-white p-6"><h2 className="text-lg font-black">已连接的 Worker</h2><p className="mt-2 text-sm text-[#617068]">每台设备使用独立令牌；设备丢失或不再使用时，应立即撤销。</p><div className="mt-5 divide-y divide-[#e4e9e4]">{devices.length ? devices.map((device) => <article key={device.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><div className="flex items-center gap-2"><p className="font-extrabold">{device.displayName}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${device.revokedAt ? "bg-[#eeeeea] text-[#788179]" : "bg-[#e4f3e8] text-[#2f755f]"}`}>{device.revokedAt ? "已撤销" : "已连接"}</span></div><p className="mt-1 text-xs text-[#76837c]">创建于 {formatDate(device.createdAt)} · 最近同步 {formatDate(device.lastSeenAt)}</p></div>{!device.revokedAt && <button disabled={busy} onClick={() => revoke(device.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">撤销令牌</button>}</article>) : <p className="py-8 text-sm text-[#76837c]">还没有 Worker 设备。</p>}</div></section>
  </div>;
}
