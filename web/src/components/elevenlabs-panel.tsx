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
      setError("至少需要一个有效的 Voice ID。");
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
        setError(body.message ?? "无法保存 ElevenLabs 配置。");
        return;
      }
      // Immediately discard the only client-side copy after it reaches the API.
      setApiKey("");
      setStatus(body as ElevenLabsPanelStatus);
      setVoices(body.metadata.voices);
      setModelId(body.metadata.modelId);
      setLoadError(false);
      setNotice("ElevenLabs 凭据已保存。可用下方「试听」验证每个声音。");
    } catch {
      setError("无法连接设置服务，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function preview(index: number) {
    const voiceId = voices[index]?.voiceId.trim();
    if (!voiceId) {
      setError("请先填写 Voice ID 再试听。");
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
        setError(body.message ?? "试听失败，请检查密钥与 Voice ID。");
        return;
      }
      const blob = await response.blob();
      if (!blob.size) {
        setError("试听返回了空音频，请稍后重试。");
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
      setError("无法播放试听音频，请稍后重试。");
    } finally {
      setPreviewing((value) => (value === index ? null : value));
    }
  }

  return (
    <section className="rounded-2xl border border-[#dce4dc] bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">ElevenLabs 语音</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#617068]">
            使用 ElevenLabs 生成复习音频。API Key 只会发送到本站服务端，并以加密形式保存。
          </p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#617068]">
            <a
              href="https://elevenlabs.io/app/developers/api-keys"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-[#2f755f] underline underline-offset-2"
            >
              前往 ElevenLabs 获取 API Key
            </a>
            ，建议只开放 Text to Speech 权限，并设置额度上限。
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold ${
            status.configured ? "bg-[#e4f3e8] text-[#2f755f]" : "bg-[#eeeeea] text-[#788179]"
          }`}
        >
          {status.configured ? "已保存凭据" : "未配置"}
        </span>
      </div>

      {status.configured && status.keySuffix && (
        <p className="mt-5 text-sm text-[#456457]">
          已保存密钥：<code>••••{status.keySuffix}</code>
        </p>
      )}

      {loadError && (
        <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800" role="alert">
          暂时无法读取语音配置。数据库更新可能仍在部署中，你可以稍后刷新再试。
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
          placeholder={status.configured ? "留空以保留现有密钥，粘贴可替换" : "粘贴 ElevenLabs API Key"}
        />
      </label>

      <div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-extrabold">声音列表（可保存多个，听力跟读时切换）</span>
          <span className="text-xs text-[#819087]">最多 {MAX_VOICES} 个 · 第一个为默认</span>
        </div>
        <div className="mt-3 space-y-3">
          {voices.map((voice, index) => (
            <div key={index} className="rounded-xl border border-[#e3e9e3] bg-[#fbfcfa] p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <label>
                  <span className="text-xs font-extrabold text-[#6b7b74]">名称{index === 0 ? "（默认）" : ""}</span>
                  <input
                    value={voice.name}
                    onChange={(event) => updateVoice(index, { name: event.target.value })}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={`声音 ${index + 1}`}
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
                    placeholder="例如 JBFqnCBsd6RMkjVDRZzb"
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
                  {previewing === index ? "试听中…" : "试听"}
                </button>
                {voices.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVoice(index)}
                    disabled={busy}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    删除
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
            + 添加声音
          </button>
        )}
      </div>

      <label className="mt-5 block sm:max-w-xs">
        <span className="text-sm font-extrabold">模型</span>
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
          {busy ? "正在处理…" : "保存配置"}
        </button>
        {status.configured && (
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("确定删除已保存的 ElevenLabs API Key 吗？")) return;
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const response = await fetch("/api/integrations/elevenlabs", { method: "DELETE" });
                const body = await response.json().catch(() => ({}));
                if (!response.ok) {
                  setError(body.message ?? "无法删除 ElevenLabs 配置。");
                  return;
                }
                setApiKey("");
                setStatus(body as ElevenLabsPanelStatus);
                setVoices(body.metadata.voices);
                setModelId(body.metadata.modelId);
                setLoadError(false);
                setNotice("ElevenLabs 凭据已删除。");
              } catch {
                setError("无法连接设置服务，请检查网络后重试。");
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
            className="rounded-xl border border-red-200 px-5 py-3 font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            删除凭据
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
