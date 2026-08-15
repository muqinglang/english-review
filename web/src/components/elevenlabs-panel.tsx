"use client";

import { useState } from "react";

export type ElevenLabsPanelStatus = {
  configured: boolean;
  keySuffix: string | null;
  metadata: { voiceId: string; modelId: string };
};

export function ElevenLabsPanel({
  initialStatus,
  initialLoadError = false,
}: {
  initialStatus: ElevenLabsPanelStatus;
  initialLoadError?: boolean;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [apiKey, setApiKey] = useState("");
  const [voiceId, setVoiceId] = useState(initialStatus.metadata.voiceId);
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
      const response = await fetch("/api/integrations/elevenlabs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(apiKey.trim() ? { apiKey } : {}),
          voiceId,
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
      setVoiceId(body.metadata.voiceId);
      setModelId(body.metadata.modelId);
      setLoadError(false);
      setNotice("ElevenLabs 凭据已保存，尚未验证可用性。");
    } catch {
      setError("无法连接设置服务，请检查网络后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("确定删除已保存的 ElevenLabs API Key 吗？")) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/integrations/elevenlabs", {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.message ?? "无法删除 ElevenLabs 配置。");
        return;
      }

      setApiKey("");
      setStatus(body as ElevenLabsPanelStatus);
      setVoiceId(body.metadata.voiceId);
      setModelId(body.metadata.modelId);
      setLoadError(false);
      setNotice("ElevenLabs 凭据已删除。");
    } catch {
      setError("无法连接设置服务，请检查网络后重试。");
    } finally {
      setBusy(false);
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
            status.configured
              ? "bg-[#e4f3e8] text-[#2f755f]"
              : "bg-[#eeeeea] text-[#788179]"
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-sm font-extrabold">API Key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]"
            placeholder={
              status.configured
                ? "留空以保留现有密钥，粘贴可替换"
                : "粘贴 ElevenLabs API Key"
            }
          />
        </label>
        <label>
          <span className="text-sm font-extrabold">Voice ID</span>
          <input
            value={voiceId}
            onChange={(event) => setVoiceId(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]"
          />
        </label>
        <label>
          <span className="text-sm font-extrabold">模型</span>
          <input
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={saveConfiguration}
          disabled={
            busy ||
            !voiceId.trim() ||
            !modelId.trim() ||
            (!status.configured && !apiKey.trim())
          }
          className="rounded-xl bg-[#172223] px-5 py-3 font-bold text-white disabled:opacity-50"
        >
          {busy ? "正在处理…" : "保存配置"}
        </button>
        {status.configured && (
          <button
            type="button"
            onClick={disconnect}
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
