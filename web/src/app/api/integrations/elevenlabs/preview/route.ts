import { currentUser } from "@/lib/auth";
import { getElevenLabsCredential, synthesizeElevenLabsAudio } from "@/lib/elevenlabs";

export const runtime = "nodejs";

const PREVIEW_TEXT = "Hello! This is a quick voice preview for your English review.";
const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function upstreamMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as { detail?: { message?: unknown }; message?: unknown };
    const detail = parsed.detail?.message ?? parsed.message;
    return typeof detail === "string" ? detail : "ElevenLabs 未能生成试听语音。";
  } catch {
    return "ElevenLabs 未能生成试听语音。";
  }
}

// Preview uses the saved API key + model, but synthesizes with the voice ID the
// user is currently testing (which may not be saved yet), so they get a real,
// non-silent answer instead of the review page's quiet browser fallback.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "请先登录。" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const requested =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).voiceId
      : undefined;
  const voiceId = typeof requested === "string" ? requested.trim() : "";
  if (!VOICE_ID_PATTERN.test(voiceId)) {
    return Response.json({ message: "Voice ID 无效。" }, { status: 400 });
  }

  let credential: Awaited<ReturnType<typeof getElevenLabsCredential>>;
  try {
    credential = await getElevenLabsCredential(user.id);
  } catch {
    return Response.json({ message: "无法读取 ElevenLabs 配置。" }, { status: 500 });
  }
  if (!credential) {
    return Response.json({ message: "请先保存 ElevenLabs API Key 再试听。" }, { status: 409 });
  }

  // Allow previewing any well-formed voice ID (not just saved ones) so the user
  // can audition a voice before committing it. Only the saved key is used.
  const testCredential = {
    apiKey: credential.apiKey,
    metadata: {
      ...credential.metadata,
      voiceId,
      voices: [{ voiceId, name: "preview" }, ...credential.metadata.voices],
    },
  };

  let upstream: Response;
  try {
    upstream = await synthesizeElevenLabsAudio(testCredential, PREVIEW_TEXT, voiceId);
  } catch {
    return Response.json({ message: "无法连接 ElevenLabs，请稍后再试。" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    if (upstream.status === 401) {
      return Response.json({ message: "ElevenLabs API Key 无效或无 Text to Speech 权限。" }, { status: 401 });
    }
    if (upstream.status === 429) {
      return Response.json({ message: "ElevenLabs 额度不足或请求过于频繁。" }, { status: 429 });
    }
    const message = upstreamMessage(await upstream.text().catch(() => ""));
    return Response.json({ message }, { status: upstream.status >= 400 ? upstream.status : 502 });
  }

  return new Response(upstream.body, {
    headers: { "content-type": "audio/mpeg", "cache-control": "private, no-store, max-age=0" },
  });
}
