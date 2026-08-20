"use client";

import { useState } from "react";

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
    <section className="rounded-2xl border border-[#dce4dc] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">DeepSeek Story Writer</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617068]">
            Uses DeepSeek to weave the words you have due for review into one short story for listening practice. Your API Key is sent only to this site&apos;s server and stored encrypted.
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#617068]">
            <a
              href="https://platform.deepseek.com/api_keys"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[#2f755f] underline underline-offset-2"
            >
              Get an API Key from DeepSeek
            </a>
            .
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            status.configured ? "bg-[#e4f3e8] text-[#2f755f]" : "bg-[#eeeeea] text-[#788179]"
          }`}
        >
          {status.configured ? "Credentials saved" : "Not configured"}
        </span>
      </div>

      {status.configured && status.keySuffix && (
        <p className="mt-5 text-sm text-[#456457]">
          Saved key: <code>••••{status.keySuffix}</code>
        </p>
      )}

      {loadError && (
        <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800" role="alert">
          DeepSeek configuration is temporarily unavailable. A database update may still be deploying; refresh and try again later.
        </p>
      )}

      <label className="mt-5 block">
        <span className="text-sm font-extrabold">API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-2 w-full rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]"
          placeholder={status.configured ? "Leave blank to keep the current key, or paste to replace it" : "Paste your DeepSeek API Key"}
        />
      </label>

      <label className="mt-5 block sm:max-w-xs">
        <span className="text-sm font-extrabold">Model</span>
        <input
          value={modelId}
          onChange={(event) => setModelId(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-2 w-full rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveConfiguration}
          disabled={busy || !modelId.trim() || (!status.configured && !apiKey.trim())}
          className="rounded-xl bg-[#172223] px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          {busy ? "Processing…" : "Save configuration"}
        </button>
        {status.configured && (
          <button
            type="button"
            onClick={deleteConfiguration}
            disabled={busy}
            className="rounded-xl border border-red-200 px-5 py-3 font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Delete credentials
          </button>
        )}
      </div>

      {notice && (
        <p className="mt-4 rounded-xl bg-[#f0f8f2] p-4 text-sm text-[#285e48]" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
