"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

const STORAGE_KEY = "english-review-tts-provider";
type Provider = "fish_audio" | "elevenlabs";

export function VoiceProviderPreference({ fishConfigured, elevenLabsConfigured }: { fishConfigured: boolean; elevenLabsConfigured: boolean }) {
  const [provider, setProvider] = useState<Provider>("fish_audio");
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const frame = window.requestAnimationFrame(() => {
      if (saved === "fish_audio" || saved === "elevenlabs") setProvider(saved);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  function choose(next: Provider) {
    setProvider(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  return <Card>
    <h2 className="text-lg font-black text-ink">Listening Voice</h2>
    <p className="mt-2 text-sm leading-6 text-muted">Choose which service this browser uses to play review audio. Each set of keys is stored encrypted separately.</p>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Voice service selection">
      <button type="button" onClick={() => choose("fish_audio")} className={`rounded-control border px-4 py-2.5 text-sm font-bold ${provider === "fish_audio" ? "border-primary bg-mint text-primary-strong" : "border-line text-muted"}`}>Fish Audio {fishConfigured ? "Credentials saved" : "Not configured"}</button>
      <button type="button" onClick={() => choose("elevenlabs")} className={`rounded-control border px-4 py-2.5 text-sm font-bold ${provider === "elevenlabs" ? "border-primary bg-mint text-primary-strong" : "border-line text-muted"}`}>ElevenLabs {elevenLabsConfigured ? "Credentials saved" : "Not configured"}</button>
    </div>
  </Card>;
}
