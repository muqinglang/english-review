import { currentUser } from "@/lib/auth";
import { getFishAudioCredential, synthesizeFishAudio } from "@/lib/fish-audio";
import { getElevenLabsCredential, synthesizeElevenLabsAudio } from "@/lib/elevenlabs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_TEXT_LENGTH = 600;
type TtsProvider = "fish_audio" | "elevenlabs";

// Free-text speech for review example sentences (and other on-page prose that is
// not a stored listening card). Unlike /api/tts, it does not look content up by
// review/card id, so it accepts any short text — still guarded by the same daily
// character quota and the learner's own provider credentials.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "请先登录。" }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "请求内容无效。" }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const text = typeof input.text === "string" ? input.text.trim() : "";
  const provider: TtsProvider = input.provider === "elevenlabs" ? "elevenlabs" : "fish_audio";
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return Response.json({ message: "文本为空或过长。" }, { status: 400 });
  }

  const admin = createAdminClient();
  const characterCount = Array.from(text).length;
  const { data: reserved, error: reservationError } = await admin.rpc("reserve_tts_usage", {
    p_user_id: user.id,
    p_characters: characterCount,
  });
  if (reservationError) {
    return Response.json({ message: "无法检查今日语音额度。" }, { status: 500 });
  }
  if (reserved !== true) {
    return Response.json({ message: "今天的语音生成额度已达上限，请明天再试。" }, { status: 429 });
  }

  let upstream: Response;
  try {
    if (provider === "elevenlabs") {
      const credential = await getElevenLabsCredential(user.id);
      if (!credential) return Response.json({ message: "请先在设置中连接 ElevenLabs。" }, { status: 409 });
      const requestedVoiceId = typeof input.voiceId === "string" ? input.voiceId.trim() : undefined;
      upstream = await synthesizeElevenLabsAudio(credential, text, requestedVoiceId);
    } else {
      const credential = await getFishAudioCredential(user.id);
      if (!credential) return Response.json({ message: "请先在设置中连接 Fish Audio。" }, { status: 409 });
      upstream = await synthesizeFishAudio(credential, text);
    }
  } catch {
    return Response.json({ message: "语音服务暂时无法连接，请稍后重试。" }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    if (upstream.status === 429) {
      return Response.json(
        { message: `${provider === "elevenlabs" ? "ElevenLabs" : "Fish Audio"} 额度不足或请求过于频繁。` },
        { status: 429 },
      );
    }
    return Response.json(
      { message: `${provider === "elevenlabs" ? "ElevenLabs" : "Fish Audio"} 未能生成语音，请检查配置或稍后重试。` },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
