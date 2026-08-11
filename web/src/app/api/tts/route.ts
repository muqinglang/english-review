import { currentUser } from "@/lib/auth";
import { getElevenLabsCredential } from "@/lib/elevenlabs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_TEXT_LENGTH = 1_000;
const MIN_SPEED = 0.7;
const MAX_SPEED = 1.2;

type AudioCard = {
  id: string;
  normal: string;
  slow?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function audioCards(value: unknown): AudioCard[] | null {
  if (!isRecord(value) || !Array.isArray(value.cards)) return null;

  const cards: AudioCard[] = [];
  for (const raw of value.cards) {
    if (
      !isRecord(raw) ||
      typeof raw.id !== "string" ||
      !raw.id ||
      typeof raw.normal !== "string" ||
      !raw.normal.trim()
    ) {
      return null;
    }
    if (raw.slow !== undefined && typeof raw.slow !== "string") return null;
    cards.push({
      id: raw.id,
      normal: raw.normal,
      ...(typeof raw.slow === "string" && raw.slow.trim()
        ? { slow: raw.slow }
        : {}),
    });
  }
  return cards;
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return Response.json({ message: "请先登录。" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "请求内容无效。" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const cardId = typeof input.cardId === "string" ? input.cardId.trim() : "";
  if (!isUuid(input.reviewId) || !cardId || cardId.length > 240) {
    return Response.json(
      { message: "复习或音频卡片 ID 无效。" },
      { status: 400 },
    );
  }
  if (input.variant !== "normal" && input.variant !== "slow") {
    return Response.json(
      { message: "音频版本必须是 normal 或 slow。" },
      { status: 400 },
    );
  }

  const speed = input.speed;
  if (
    typeof speed !== "number" ||
    !Number.isFinite(speed) ||
    speed < MIN_SPEED ||
    speed > MAX_SPEED
  ) {
    return Response.json(
      { message: "语速必须在 0.7 到 1.2 之间。" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: review, error: reviewError } = await admin
    .from("reviews")
    .select("audio_script_json")
    .eq("id", input.reviewId)
    .eq("user_id", user.id)
    .eq("status", "ready")
    .maybeSingle();

  if (reviewError) {
    return Response.json(
      { message: "无法读取复习音频。" },
      { status: 500 },
    );
  }

  const cards = review ? audioCards(review.audio_script_json) : null;
  const card = cards?.find((candidate) => candidate.id === cardId);
  if (!card) {
    // Use one response for missing and other-user resources to avoid disclosing
    // whether a guessed review/card ID exists.
    return Response.json({ message: "复习音频不存在。" }, { status: 404 });
  }

  const text = input.variant === "slow" ? card.slow ?? card.normal : card.normal;
  if (!text.trim() || text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { message: "这张音频卡片不适合语音合成。" },
      { status: 422 },
    );
  }

  let credential: Awaited<ReturnType<typeof getElevenLabsCredential>>;
  try {
    credential = await getElevenLabsCredential(user.id);
  } catch {
    return Response.json(
      { message: "无法读取语音服务配置。" },
      { status: 500 },
    );
  }

  if (!credential) {
    return Response.json(
      { message: "请先在设置中连接 ElevenLabs。" },
      { status: 409 },
    );
  }

  const characterCount = Array.from(text).length;
  const { data: reserved, error: reservationError } = await admin.rpc(
    "reserve_tts_usage",
    {
      p_user_id: user.id,
      p_characters: characterCount,
    },
  );
  if (reservationError) {
    return Response.json(
      { message: "无法检查今日语音额度。" },
      { status: 500 },
    );
  }
  if (reserved !== true) {
    return Response.json(
      { message: "今天的 ElevenLabs 使用额度已达上限，请明天再试。" },
      { status: 429 },
    );
  }

  const endpoint = new URL(
    `/v1/text-to-speech/${encodeURIComponent(credential.metadata.voiceId)}`,
    "https://api.elevenlabs.io",
  );
  endpoint.searchParams.set("output_format", "mp3_44100_128");

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "audio/mpeg",
        "content-type": "application/json",
        "xi-api-key": credential.apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: credential.metadata.modelId,
        voice_settings: { speed },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return Response.json(
      { message: "ElevenLabs 暂时无法连接，请稍后重试。" },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    if (upstream.status === 429) {
      return Response.json(
        { message: "ElevenLabs 请求过于频繁或额度不足。" },
        { status: 429 },
      );
    }
    return Response.json(
      { message: "ElevenLabs 未能生成语音，请检查配置或稍后重试。" },
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
