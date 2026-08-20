"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/field";

export type DeepSeekPanelStatus = {
  configured: boolean;
  keySuffix: string | null;
  metadata: { modelId: string };
};

export function DeepSeekPanel({
  initialStatus,
  initialLoadError = false,
}: {
  initialStatus: DeepSeekPanelStatus;
  initialLoadError?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState(initialStatus.metadata.modelId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState(initialLoadError);

  async function saveConfiguration() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations/deepseek", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(apiKey.trim() ? { apiKey } : {}), modelId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? "Could not save the DeepSeek configuration.");
        return;
      }
      // Immediately discard the only client-side copy after it reaches the API.
      setApiKey("");
      setStatus(body as DeepSeekPanelStatus);
      setModelId(body.metadata.modelId);
      setLoadError(false);
      setNotice("DeepSeek credentials saved. The Listening tab can now write review stories.");
    } catch {
      setError("Could not reach the settings service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteConfiguration() {
    if (!window.confirm("Delete the saved DeepSeek API Key?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations/deepseek", { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? "Could not delete the DeepSeek configuration.");
        return;
      }
      setApiKey("");
      setStatus(body as DeepSeekPanelStatus);
      setModelId(body.metadata.modelId);
      setLoadError(false);
      setNotice("DeepSeek credentials deleted.");
    } catch {
      setError("Could not reach the settings service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-ink">DeepSeek Story Writer</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Uses DeepSeek to weave the words you have due for review into one short story for listening practice. Your API Key is sent only to this site&apos;s server and stored encrypted.
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-primary underline underline-offset-2"
            >
              Get an API Key from DeepSeek
            </a>
            .
          </p>
        </div>
        <Badge tone={status.configured ? "success" : "neutral"}>
          {status.configured ? "Credentials saved" : "Not configured"}
        </Badge>
      </div>

      {status.configured && status.keySuffix && (
        <p className="mt-5 text-sm text-primary-strong">
          Saved key: <code>••••{status.keySuffix}</code>
        </p>
      )}

      {loadError && (
        <Alert tone="warning" role="alert" className="mt-5">
          DeepSeek configuration is temporarily unavailable. A database update may still be deploying; refresh and try again later.
        </Alert>
      )}

      <label className="mt-5 block">
        <span className="text-sm font-extrabold text-ink">API Key</span>
        <Input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-2"
          placeholder={status.configured ? "Leave blank to keep the current key, or paste to replace it" : "Paste your DeepSeek API Key"}
        />
      </label>

      <label className="mt-5 block sm:max-w-xs">
        <span className="text-sm font-extrabold text-ink">Model</span>
        <Input
          value={modelId}
          onChange={(event) => setModelId(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-2"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="primary"
          type="button"
          onClick={saveConfiguration}
          disabled={busy || !modelId.trim() || (!status.configured && !apiKey.trim())}
        >
          {busy ? "Processing…" : "Save configuration"}
        </Button>
        {status.configured && (
          <Button
            variant="danger"
            type="button"
            onClick={deleteConfiguration}
            disabled={busy}
          >
            Delete credentials
          </Button>
        )}
      </div>

      {notice && (
        <Alert tone="success" role="status" className="mt-4">
          {notice}
        </Alert>
      )}
      {error && (
        <Alert tone="error" role="alert" className="mt-4">
          {error}
        </Alert>
      )}
    </Card>
  );
}
