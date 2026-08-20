"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/field";

export type FishAudioPanelStatus = { configured: boolean; keySuffix: string | null; metadata: { referenceId: string | null; modelId: string } };

export function FishAudioPanel({ initialStatus }: { initialStatus: FishAudioPanelStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [referenceId, setReferenceId] = useState(initialStatus.metadata.referenceId ?? "");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/fish-audio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(apiKey.trim() ? { apiKey } : {}), referenceId: referenceId || null, modelId: "s2-pro" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not save the Fish Audio configuration.");
      setApiKey(""); setStatus(body); setNotice("Fish Audio credentials saved, but not yet verified.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the Fish Audio configuration."); }
    finally { setBusy(false); }
  }

  async function testVoice() {
    setTesting(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/fish-audio/test", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Fish Audio could not generate a test voice.");
      }
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
      setNotice("Playing the test voice.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Fish Audio test failed."); }
    finally { setTesting(false); }
  }

  async function removeConfiguration() {
    if (!window.confirm("Delete the saved Fish Audio API Key?")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/fish-audio", { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Could not delete the Fish Audio configuration.");
      setApiKey(""); setStatus(body); setReferenceId(""); setNotice("Fish Audio credentials deleted.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the Fish Audio configuration."); }
    finally { setBusy(false); }
  }

  return <Card>
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black text-ink">Fish Audio Voice</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted">Generate listening audio for English answers and example sentences. Your key is sent only to this site&apos;s server and stored encrypted; &quot;Credentials saved&quot; does not mean the key has been verified by the service.</p></div><Badge tone={status.configured ? "success" : "neutral"}>{status.configured ? "Credentials saved" : "Not configured"}</Badge></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="text-sm font-bold text-ink">API Key</span><Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" className="mt-2" placeholder={status.configured ? "Leave blank to keep the current key" : "Paste your Fish Audio API Key"} /></label><label><span className="text-sm font-bold text-ink">Voice ID (optional)</span><Input value={referenceId} onChange={(event) => setReferenceId(event.target.value)} className="mt-2" placeholder="Leave blank to use the default English voice" /></label><div className="self-end text-sm leading-6 text-muted">Model: <code>s2-pro</code></div></div>
    <div className="mt-5 flex flex-wrap items-center gap-3"><Button variant="primary" type="button" disabled={busy || (!status.configured && !apiKey.trim())} onClick={save}>{busy ? "Saving…" : "Save"}</Button><Button variant="secondary" type="button" disabled={testing || !status.configured} onClick={testVoice}>{testing ? "Testing…" : "Test voice"}</Button>{status.configured && <Button variant="danger" type="button" disabled={busy} onClick={removeConfiguration}>Delete credentials</Button>}{status.keySuffix && <span className="text-sm text-muted">Saved key ending: {status.keySuffix}</span>}</div>
    {notice && <Alert tone="success" role="status" className="mt-4 font-bold">{notice}</Alert>}{error && <Alert tone="error" role="alert" className="mt-4 font-bold">{error}</Alert>}
  </Card>;
}
