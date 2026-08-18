"use client";

import { useEffect, useState } from "react";

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
  return <section className="rounded-2xl border border-[#dce4dc] bg-white p-6">
    <h2 className="text-lg font-black">Listening Voice</h2>
    <p className="mt-2 text-sm leading-6 text-[#617068]">Choose which service this browser uses to play review audio. Each set of keys is stored encrypted separately.</p>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Voice service selection">
      <button type="button" onClick={() => choose("fish_audio")} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${provider === "fish_audio" ? "border-[#2f755f] bg-[#edf5ef] text-[#286247]" : "border-[#cfd9d2] text-[#596861]"}`}>Fish Audio {fishConfigured ? "Credentials saved" : "Not configured"}</button>
      <button type="button" onClick={() => choose("elevenlabs")} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${provider === "elevenlabs" ? "border-[#2f755f] bg-[#edf5ef] text-[#286247]" : "border-[#cfd9d2] text-[#596861]"}`}>ElevenLabs {elevenLabsConfigured ? "Credentials saved" : "Not configured"}</button>
    </div>
  </section>;
}
