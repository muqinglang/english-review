"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type WorkerDevice = { id: string; displayName: string; createdAt: string; lastSeenAt: string | null; revokedAt: string | null };

function formatDate(value: string | null) {
  if (!value) return "Not synced yet";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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
    if (!response.ok) { setError(body.message ?? "Could not create the token."); return; }
    setToken(body.token);
    router.refresh();
  }

  async function copyToken() {
    try { await navigator.clipboard.writeText(token); setCopied(true); } catch { setError("Could not copy automatically. Please select the token manually.") }
  }

  async function revoke(deviceId: string) {
    if (!window.confirm("Once revoked, this Worker can no longer push. Revoke it?")) return;
    setBusy(true); setError("");
    const response = await fetch("/api/worker/device", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.message ?? "Could not revoke the token."); return; }
    router.refresh();
  }

  return <div className="space-y-8">
    <section className="rounded-2xl border border-[#dce4dc] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black">Connect a new local Worker</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#617068]">Generate a dedicated token for one computer. The token is shown only once, so save it to the machine&apos;s encrypted config right away.</p></div><span className="rounded-full bg-[#edf5ef] px-3 py-1 text-xs font-extrabold text-[#2f755f]">SERVER CREDENTIAL</span></div>
      {!token ? <div className="mt-6 flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="worker-name">Device name</label><input id="worker-name" value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]" placeholder="e.g. Home Windows PC" /><button onClick={createToken} disabled={busy || !displayName.trim()} className="rounded-xl bg-[#172223] px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "Generating…" : "Generate token"}</button></div> : <div className="mt-6 rounded-2xl border border-[#9fc9af] bg-[#f0f8f2] p-5"><p className="text-sm font-extrabold text-[#285e48]">Token generated, save it now</p><code className="mt-3 block break-all rounded-xl bg-[#172223] p-4 text-sm text-white">{token}</code><div className="mt-3 flex flex-wrap gap-2"><button onClick={copyToken} className="rounded-lg bg-[#2f755f] px-4 py-2 text-sm font-bold text-white">{copied ? "Copied" : "Copy token"}</button><button onClick={() => { setToken(""); setCopied(false); }} className="rounded-lg border border-[#9fc9af] px-4 py-2 text-sm font-bold text-[#285e48]">I&apos;ve saved it</button></div><p className="mt-4 text-sm leading-6 text-[#456457]">On that machine, run <code className="rounded bg-white px-1.5 py-0.5">.\worker\configure-token.ps1</code> and paste the token into the hidden input.</p></div>}
      {error && <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
    </section>
    <section className="rounded-2xl border border-[#dce4dc] bg-white p-6"><h2 className="text-lg font-black">Connected Workers</h2><p className="mt-2 text-sm text-[#617068]">Each device uses its own token; revoke it immediately if a device is lost or no longer in use.</p><div className="mt-5 divide-y divide-[#e4e9e4]">{devices.length ? devices.map((device) => <article key={device.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><div className="flex items-center gap-2"><p className="font-extrabold">{device.displayName}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${device.revokedAt ? "bg-[#eeeeea] text-[#788179]" : "bg-[#e4f3e8] text-[#2f755f]"}`}>{device.revokedAt ? "Revoked" : "Connected"}</span></div><p className="mt-1 text-xs text-[#76837c]">Created {formatDate(device.createdAt)} · Last synced {formatDate(device.lastSeenAt)}</p></div>{!device.revokedAt && <button disabled={busy} onClick={() => revoke(device.id)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">Revoke token</button>}</article>) : <p className="py-8 text-sm text-[#76837c]">No Worker devices yet.</p>}</div></section>
  </div>;
}
