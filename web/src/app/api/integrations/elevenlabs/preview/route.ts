import { currentUser } from "@/lib/auth";
import { getElevenLabsCredential, synthesizeElevenLabsAudio } from "@/lib/elevenlabs";

export const runtime = "nodejs";

const PREVIEW_TEXT = "Hello! This is a quick voice preview for your English review.";
const VOICE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function upstreamMessage(body: string) {
  try {
    const parsed = JSON.parse(body) as { detail?: { message?: unknown }; message?: unknown };
    const detail = parsed.detail?.message ?? parsed.message;
    return typeof detail === "string" ? detail : "ElevenLabs could not generate the preview audio.";
  } catch {
    return "ElevenLabs could not generate the preview audio.";
  }
}

// Preview uses the saved API key + model, but synthesizes with the voice ID the
// user is currently testing (which may not be saved yet), so they get a real,
// non-silent answer instead of the review page's quiet browser fallback.
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Please sign in first." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  const requested =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).voiceId
      : undefined;
  const voiceId = typeof requested === "string" ? requested.trim() : "";
  if (!VOICE_ID_PATTERN.test(voiceId)) {
    return Response.json({ message: "Invalid Voice ID." }, { status: 400 });
  }

  let credential: Awaited<ReturnType<typeof getElevenLabsCredential>>;
  try {
    credential = await getElevenLabsCredential(user.id);
  } catch {
    return Response.json({ message: "Unable to load ElevenLabs configuration." }, { status: 500 });
  }
  if (!credential) {
    return Response.json({ message: "Please save your ElevenLabs API key before previewing." }, { status: 409 });
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
    return Response.json({ message: "Unable to connect to ElevenLabs. Please try again later." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    if (upstream.status === 401) {
      return Response.json({ message: "ElevenLabs API key is invalid or lacks Text to Speech permission." }, { status: 401 });
    }
    if (upstream.status === 429) {
      return Response.json({ message: "ElevenLabs quota is insufficient or requests are too frequent." }, { status: 429 });
    }
    const message = upstreamMessage(await upstream.text().catch(() => ""));
    return Response.json({ message }, { status: upstream.status >= 400 ? upstream.status : 502 });
  }

  return new Response(upstream.body, {
    headers: { "content-type": "audio/mpeg", "cache-control": "private, no-store, max-age=0" },
  });
}
