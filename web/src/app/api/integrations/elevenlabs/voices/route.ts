import { currentUser } from "@/lib/auth";
import { getElevenLabsCredential } from "@/lib/elevenlabs";

export const runtime = "nodejs";

// List the voices the learner's own ElevenLabs key can actually synthesize.
// /v1/voices only returns voices in their account collection, so everything it
// returns is usable on their plan — no more guessing which voice is allowed.
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ message: "Please sign in first." }, { status: 401 });

  const credential = await getElevenLabsCredential(user.id);
  if (!credential) {
    return Response.json({ message: "Please connect ElevenLabs and save your API key first." }, { status: 409 });
  }

  let upstream: Response;
  try {
    upstream = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": credential.apiKey, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json({ message: "Couldn't reach ElevenLabs. Please try again later." }, { status: 502 });
  }
  if (!upstream.ok) {
    return Response.json(
      { message: "ElevenLabs rejected the request. Check that your saved API key is valid." },
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => null) as { voices?: unknown } | null;
  const raw = Array.isArray(data?.voices) ? data!.voices : [];
  // Premade voices work on every plan, so surface them first.
  const order = (category: string) => (category === "premade" ? 0 : category === "professional" ? 2 : 1);
  const voices = raw
    .map((value) => {
      const v = value as Record<string, unknown>;
      return {
        voiceId: typeof v.voice_id === "string" ? v.voice_id : "",
        name: typeof v.name === "string" ? v.name : "",
        category: typeof v.category === "string" ? v.category : "",
      };
    })
    .filter((v) => v.voiceId)
    .sort((a, b) => order(a.category) - order(b.category) || a.name.localeCompare(b.name));

  return Response.json({ voices }, { headers: { "cache-control": "no-store" } });
}
