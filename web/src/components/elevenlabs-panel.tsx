"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/field";

type Voice = { voiceId: string; name: string };

export type ElevenLabsPanelStatus = {
  configured: boolean;
  keySuffix: string | null;
  metadata: { voiceId: string; modelId: string; voices: Voice[] };
};

const MAX_VOICES = 10;

// Long-standing ElevenLabs stock voices grouped by accent. Preview uses the
// user's own key, so they can confirm the accent before saving.
const ACCENT_PRESETS: { accent: string; voices: Voice[] }[] = [
  {
    accent: "British",
    voices: [{ voiceId: "JBFqnCBsd6RMkjVDRZzb", name: "George · British" }],
  },
  {
    accent: "American",
    voices: [
      { voiceId: "21m00Tcm4TlvDq8ikWAM", name: "Rachel · American" },
      { voiceId: "pNInz6obpgDQGcFmaJgB", name: "Adam · American" },
    ],
  },
];

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
  const [importing, setImporting] = useState(false);
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
  function addPresetVoice(preset: Voice) {
    setVoices((current) => {
      if (current.some((voice) => voice.voiceId.trim() === preset.voiceId)) return current;
      // Fill the first empty row if there is one, otherwise append (respecting the cap).
      const emptyIndex = current.findIndex((voice) => !voice.voiceId.trim());
      if (emptyIndex >= 0) return current.map((voice, i) => (i === emptyIndex ? { ...preset } : voice));
      return current.length >= MAX_VOICES ? current : [...current, { ...preset }];
    });
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

  // Pull the voices the saved key can actually use (server-side call to
  // /v1/voices) and add the ones not already listed, up to the cap. This removes
  // the guesswork of which Voice IDs the learner's plan is allowed to synthesize.
  async function importVoices() {
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations/elevenlabs/voices");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.message ?? "Couldn't load your ElevenLabs voices. Save your API key first, then try again.");
        return;
      }
      const fetched = (Array.isArray(body.voices) ? body.voices : []) as { voiceId: string; name: string }[];
      if (!fetched.length) {
        setNotice("No voices were found on your ElevenLabs account.");
        return;
      }
      let addedCount = 0;
      let available = 0;
      setVoices((current) => {
        const kept = current.filter((voice) => voice.voiceId.trim());
        const existing = new Set(kept.map((voice) => voice.voiceId.trim()));
        const additions = fetched.filter((voice) => voice.voiceId && !existing.has(voice.voiceId));
        available = additions.length;
        const merged = [...kept];
        for (const voice of additions) {
          if (merged.length >= MAX_VOICES) break;
          merged.push({ voiceId: voice.voiceId, name: (voice.name || "Voice").slice(0, 40) });
          addedCount += 1;
        }
        return merged.length ? merged : current;
      });
      if (addedCount === 0) {
        setNotice("Your usable ElevenLabs voices are already in the list.");
      } else if (addedCount < available) {
        setNotice(`Added ${addedCount} voice${addedCount > 1 ? "s" : ""} (list is full at ${MAX_VOICES}). Review and tap “Save configuration”.`);
      } else {
        setNotice(`Added ${addedCount} usable voice${addedCount > 1 ? "s" : ""}. Review the list and tap “Save configuration”.`);
      }
    } catch {
      setError("Could not reach the settings service. Check your connection and try again.");
    } finally {
      setImporting(false);
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
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-ink">ElevenLabs Voice</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Generate review audio with ElevenLabs. Your API Key is sent only to this site&apos;s server and stored encrypted.
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            <a
              href="https://elevenlabs.io/app/developers/api-keys"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-primary underline underline-offset-2"
            >
              Get an API Key from ElevenLabs
            </a>
            . We recommend granting Text to Speech access only and setting a quota limit.
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
          Voice configuration is temporarily unavailable. A database update may still be deploying; refresh and try again later.
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
          placeholder={status.configured ? "Leave blank to keep the current key, or paste to replace it" : "Paste your ElevenLabs API Key"}
        />
      </label>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-ink">Voice list (save several and switch during Listening)</span>
          <span className="text-xs text-faint">Up to {MAX_VOICES} · the first is the default</span>
        </div>
        <div className="mt-3 space-y-3">
          {voices.map((voice, index) => (
            <div key={index} className="rounded-control border border-line bg-[#fbfcfa] p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <label>
                  <span className="text-xs font-extrabold text-muted">Name{index === 0 ? " (default)" : ""}</span>
                  <Input
                    value={voice.name}
                    onChange={(event) => updateVoice(index, { name: event.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={`Voice ${index + 1}`}
                    className="mt-1.5 px-3 py-2"
                  />
                </label>
                <label>
                  <span className="text-xs font-extrabold text-muted">Voice ID</span>
                  <Input
                    value={voice.voiceId}
                    onChange={(event) => updateVoice(index, { voiceId: event.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="e.g. JBFqnCBsd6RMkjVDRZzb"
                    className="mt-1.5 px-3 py-2 font-mono"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => preview(index)}
                  disabled={busy || previewing !== null || !voice.voiceId.trim()}
                >
                  {previewing === index ? "Previewing…" : "Preview"}
                </Button>
                {voices.length > 1 && (
                  <Button
                    variant="danger"
                    size="sm"
                    type="button"
                    onClick={() => removeVoice(index)}
                    disabled={busy}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {voices.length < MAX_VOICES && (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={addVoice}
              disabled={busy}
              className="border-dashed"
            >
              + Add voice
            </Button>
          )}
          {status.configured && (
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={importVoices}
              disabled={busy || importing}
            >
              {importing ? "Importing…" : "Import my usable voices"}
            </Button>
          )}
        </div>
        {status.configured && (
          <p className="mt-2 text-xs leading-5 text-faint">
            “Import my usable voices” pulls every voice your saved key is allowed to use, so you never hit a plan-permission error. Then tap Save.
          </p>
        )}

        <div className="mt-4 rounded-control border border-line bg-[#f8faf7] p-3">
          <p className="text-xs font-extrabold text-muted">Quick add by accent</p>
          <p className="mt-1 text-xs leading-5 text-faint">Add a stock voice, then tap Preview to confirm the accent before saving. Switch voices per play from the Voice dropdown while reviewing.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCENT_PRESETS.flatMap((group) =>
              group.voices.map((preset) => {
                const added = voices.some((voice) => voice.voiceId.trim() === preset.voiceId);
                return (
                  <Button
                    key={preset.voiceId}
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => addPresetVoice(preset)}
                    disabled={busy || added || voices.length >= MAX_VOICES}
                    className="py-1.5"
                  >
                    {added ? "✓ " : "+ "}{preset.name}
                  </Button>
                );
              }),
            )}
          </div>
        </div>
      </div>

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
          disabled={busy || !modelId.trim() || !voices.some((voice) => voice.voiceId.trim()) || (!status.configured && !apiKey.trim())}
        >
          {busy ? "Processing…" : "Save configuration"}
        </Button>
        {status.configured && (
          <Button
            variant="danger"
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
