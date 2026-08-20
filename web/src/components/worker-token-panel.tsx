"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/field";

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
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-black text-ink">Connect a new local Worker</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Generate a dedicated token for one computer. The token is shown only once, so save it to the machine&apos;s encrypted config right away.</p></div><Badge tone="success">SERVER CREDENTIAL</Badge></div>
      {!token ? <div className="mt-6 flex flex-col gap-3 sm:flex-row"><label className="sr-only" htmlFor="worker-name">Device name</label><Input id="worker-name" value={displayName} maxLength={80} onChange={(event) => setDisplayName(event.target.value)} className="min-w-0 flex-1" placeholder="e.g. Home Windows PC" /><Button variant="primary" onClick={createToken} disabled={busy || !displayName.trim()}>{busy ? "Generating…" : "Generate token"}</Button></div> : <div className="mt-6 rounded-card border border-line bg-mint p-5"><p className="text-sm font-extrabold text-primary-strong">Token generated, save it now</p><code className="mt-3 block break-all rounded-control bg-ink p-4 text-sm text-white">{token}</code><div className="mt-3 flex flex-wrap gap-2"><Button variant="primary" size="sm" onClick={copyToken}>{copied ? "Copied" : "Copy token"}</Button><Button variant="secondary" size="sm" onClick={() => { setToken(""); setCopied(false); }}>I&apos;ve saved it</Button></div><p className="mt-4 text-sm leading-6 text-primary-strong">On that machine, run <code className="rounded bg-surface px-1.5 py-0.5">.\worker\configure-token.ps1</code> and paste the token into the hidden input.</p></div>}
      {error && <Alert tone="error" role="alert" className="mt-4">{error}</Alert>}
    </Card>
    <Card><h2 className="text-lg font-black text-ink">Connected Workers</h2><p className="mt-2 text-sm text-muted">Each device uses its own token; revoke it immediately if a device is lost or no longer in use.</p><div className="mt-5 divide-y divide-line">{devices.length ? devices.map((device) => <article key={device.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><div className="flex items-center gap-2"><p className="font-extrabold text-ink">{device.displayName}</p><Badge tone={device.revokedAt ? "neutral" : "success"}>{device.revokedAt ? "Revoked" : "Connected"}</Badge></div><p className="mt-1 text-xs text-faint">Created {formatDate(device.createdAt)} · Last synced {formatDate(device.lastSeenAt)}</p></div>{!device.revokedAt && <Button variant="danger" size="sm" disabled={busy} onClick={() => revoke(device.id)}>Revoke token</Button>}</article>) : <p className="py-8 text-sm text-faint">No Worker devices yet.</p>}</div></Card>
  </div>;
}
