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
    <h2 className="text-lg font-black">听力跟读语音</h2>
    <p className="mt-2 text-sm leading-6 text-[#617068]">选择本浏览器用于播放复习音频的服务。两套密钥分别加密保存。</p>
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="语音服务选择">
      <button type="button" onClick={() => choose("fish_audio")} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${provider === "fish_audio" ? "border-[#2f755f] bg-[#edf5ef] text-[#286247]" : "border-[#cfd9d2] text-[#596861]"}`}>Fish Audio {fishConfigured ? "已保存凭据" : "未配置"}</button>
      <button type="button" onClick={() => choose("elevenlabs")} className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${provider === "elevenlabs" ? "border-[#2f755f] bg-[#edf5ef] text-[#286247]" : "border-[#cfd9d2] text-[#596861]"}`}>ElevenLabs {elevenLabsConfigured ? "已保存凭据" : "未配置"}</button>
    </div>
  </section>;
}
