"use client";

import { useEffect, useRef, useState } from "react";

type Voice = { voiceId: string; name: string };

export type ElevenLabsPanelStatus = {
  configured: boolean;
  keySuffix: string | null;
  metadata: { voiceId: string; modelId: string; voices: Voice[] };
};

const MAX_VOICES = 6;

export function ElevenLabsPanel({
  initialStatus,
  initialLoadError = false,
}: {
  initialStatus: ElevenLabsPanelStatus;
  initialLoadError?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [voices, setVoices] = useState<Voice[]>(initialStatus.metadata.voices);
  const [modelId, setModelId] = useState(initialStatus.metadata.modelId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState(initialLoadError);
  const [previewing, setPreviewing] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => () => {
    audioRef.current?.pause();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function updateVoice(index: number, patch: Partial<Voice>) {
    setVoices((current) => current.map((voice, i) => (i === index ? { ...voice, ...patch } : voice)));
  }
  function addVoice() {
    setVoices((current) => (current.length >= MAX_VOICES ? current : [...current, { voiceId: "", name: "" }]));
  }
  function removeVoice(index: number) {
    setVoices((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  }

  async function saveConfiguration() {
    setBusy(true);
    setError("");
    setNotice("");
    const cleaned = voices
      .map((voice) => ({ voiceId: voice.voiceId.trim(), name: voice.name.trim() }))
      .filter((voice) => voice.voiceId);
    if (!cleaned.length) {
      setBusy(false);
      setError("At least one valid Voice ID is required.");
      return;
    }
    try {
      const response = await fetch("/api/integrations/elevenlabs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(apiKey.trim() ? { apiKey } : {}),
          voices: cleaned,
          modelId,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? "Could not save the ElevenLabs configuration.");
        return;
      }
      // Immediately discard the only client-side copy after it reaches the API.
      setApiKey("");
      setStatus(body as ElevenLabsPanelStatus);
      setVoices(body.metadata.voices);
      setModelId(body.metadata.modelId);
      setLoadError(false);
      setNotice("ElevenLabs credentials saved. Use Preview below to verify each voice.");
    } catch {
      setError("Could not reach the settings service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function preview(index: number) {
    const voiceId = voices[index]?.voiceId.trim();
    if (!voiceId) {
      setError("Enter a Voice ID before previewing.");
      return;
    }
    setError("");
    setNotice("");
    setPreviewing(index);
    try {
      const response = await fetch("/api/integrations/elevenlabs/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.message ?? "Preview failed. Check your key and Voice ID.");
        return;
      }
      const blob = await response.blob();
      if (!blob.size) {
        setError("The preview returned empty audio. Please try again later.");
        return;
      }
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPreviewing((value) => (value === index ? null : value));
      await audio.play();
    } catch {
      setError("Could not play the preview audio. Please try again later.");
    } finally {
      setPreviewing((value) => (value === index ? null : value));
    }
  }

  return (
    <section className="rounded-2xl border border-[#dce4dc] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">ElevenLabs Voice</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617068]">
            Generate review audio with ElevenLabs. Your API Key is sent only to this site&apos;s server and stored encrypted.
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#617068]">
            <a
              href="https://elevenlabs.io/app/developers/api-keys"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[#2f755f] underline underline-offset-2"
            >
              Get an API Key from ElevenLabs
            </a>
            . We recommend granting Text to Speech access only and setting a quota limit.
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
          Voice configuration is temporarily unavailable. A database update may still be deploying; refresh and try again later.
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
          placeholder={status.configured ? "Leave blank to keep the current key, or paste to replace it" : "Paste your ElevenLabs API Key"}
        />
      </label>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-extrabold">Voice list (save several and switch during Listening)</span>
          <span className="text-xs text-[#819087]">Up to {MAX_VOICES} · the first is the default</span>
        </div>
        <div className="mt-3 space-y-3">
          {voices.map((voice, index) => (
            <div key={index} className="rounded-xl border border-[#e3e9e3] bg-[#fbfcfa] p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <label>
                  <span className="text-xs font-extrabold text-[#6b7b74]">Name{index === 0 ? " (default)" : ""}</span>
                  <input
                    value={voice.name}
                    onChange={(event) => updateVoice(index, { name: event.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={`Voice ${index + 1}`}
                    className="mt-1.5 w-full rounded-lg border border-[#cfd9d2] px-3 py-2 text-sm outline-none focus:border-[#4e8a70]"
                  />
                </label>
                <label>
                  <span className="text-xs font-extrabold text-[#6b7b74]">Voice ID</span>
                  <input
                    value={voice.voiceId}
                    onChange={(event) => updateVoice(index, { voiceId: event.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="e.g. JBFqnCBsd6RMkjVDRZzb"
                    className="mt-1.5 w-full rounded-lg border border-[#cfd9d2] px-3 py-2 font-mono text-sm outline-none focus:border-[#4e8a70]"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => preview(index)}
                  disabled={busy || previewing !== null || !voice.voiceId.trim()}
                  className="rounded-lg border border-[#b9c9bf] bg-white px-3 py-2 text-xs font-extrabold text-[#315f4f] transition hover:bg-[#edf5ef] disabled:opacity-50"
                >
                  {previewing === index ? "Previewing…" : "Preview"}
                </button>
                {voices.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVoice(index)}
                    disabled={busy}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {voices.length < MAX_VOICES && (
          <button
            type="button"
            onClick={addVoice}
            disabled={busy}
            className="mt-3 rounded-lg border border-dashed border-[#b9c9bf] px-4 py-2 text-sm font-bold text-[#315f4f] transition hover:bg-[#edf5ef] disabled:opacity-50"
          >
            + Add voice
          </button>
        )}
      </div>

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
          disabled={busy || !modelId.trim() || !voices.some((voice) => voice.voiceId.trim()) || (!status.configured && !apiKey.trim())}
          className="rounded-xl bg-[#172223] px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          {busy ? "Processing…" : "Save configuration"}
        </button>
        {status.configured && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("Delete the saved ElevenLabs API Key?")) return;
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const response = await fetch("/api/integrations/elevenlabs", { method: "DELETE" });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                  setError(body.message ?? "Could not delete the ElevenLabs configuration.");
                  return;
                }
                setApiKey("");
                setStatus(body as ElevenLabsPanelStatus);
                setVoices(body.metadata.voices);
                setModelId(body.metadata.modelId);
                setLoadError(false);
                setNotice("ElevenLabs credentials deleted.");
              } catch {
                setError("Could not reach the settings service. Check your connection and try again.");
              } finally {
                setBusy(false);
              }
            }}
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
