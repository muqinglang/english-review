"use client";

import { useState } from "react";

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
      if (!response.ok) throw new Error(body.message || "无法保存 Fish Audio 配置。");
      setApiKey(""); setStatus(body); setNotice("Fish Audio 凭据已保存，尚未验证可用性。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法保存 Fish Audio 配置。"); }
    finally { setBusy(false); }
  }

  async function testVoice() {
    setTesting(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/fish-audio/test", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Fish Audio 未能生成测试语音。");
      }
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
      setNotice("测试语音正在播放。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Fish Audio 测试失败。"); }
    finally { setTesting(false); }
  }

  async function removeConfiguration() {
    if (!window.confirm("确定删除已保存的 Fish Audio API Key 吗？")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/integrations/fish-audio", { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "无法删除 Fish Audio 配置。");
      setApiKey(""); setStatus(body); setReferenceId(""); setNotice("Fish Audio 凭据已删除。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "无法删除 Fish Audio 配置。"); }
    finally { setBusy(false); }
  }

  return <section className="rounded-2xl border border-[#dce4dc] bg-white p-6">
    <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black">Fish Audio 语音</h2><p className="mt-2 max-w-xl text-sm leading-6 text-[#617068]">为英语答案和例句生成听力音频。密钥仅发送到本站服务端并加密保存；“已保存凭据”不代表密钥已经通过服务验证。</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${status.configured ? "bg-[#e4f3e8] text-[#2f755f]" : "bg-[#eeeeea] text-[#788179]"}`}>{status.configured ? "已保存凭据" : "未配置"}</span></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="text-sm font-bold">API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]" placeholder={status.configured ? "留空以保留现有密钥" : "粘贴 Fish Audio API Key"} /></label><label><span className="text-sm font-bold">声线 ID（可选）</span><input value={referenceId} onChange={(event) => setReferenceId(event.target.value)} className="mt-2 w-full rounded-xl border border-[#cfd9d2] px-4 py-3 outline-none focus:border-[#4e8a70]" placeholder="留空使用默认英语声线" /></label><div className="self-end text-sm leading-6 text-[#617068]">模型：<code>s2-pro</code></div></div>
    <div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" disabled={busy || (!status.configured && !apiKey.trim())} onClick={save} className="rounded-xl bg-[#172223] px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? "保存中…" : "保存"}</button><button type="button" disabled={testing || !status.configured} onClick={testVoice} className="rounded-xl border border-[#b9c9bf] bg-white px-5 py-3 font-bold text-[#315f4f] disabled:opacity-50">{testing ? "测试中…" : "测试语音"}</button>{status.configured && <button type="button" disabled={busy} onClick={removeConfiguration} className="rounded-xl border border-red-200 px-5 py-3 font-bold text-red-700 disabled:opacity-50">删除凭据</button>}{status.keySuffix && <span className="text-sm text-[#617068]">已保存密钥末尾：{status.keySuffix}</span>}</div>
    {notice && <p role="status" className="mt-4 text-sm font-bold text-[#286247]">{notice}</p>}{error && <p role="alert" className="mt-4 text-sm font-bold text-[#9b3c2f]">{error}</p>}
  </section>;
}
