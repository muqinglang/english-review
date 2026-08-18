import { currentUser } from "@/lib/auth";
import {
  deleteElevenLabsConfiguration,
  getElevenLabsStatus,
  saveElevenLabsConfiguration,
} from "@/lib/elevenlabs";

export const runtime = "nodejs";

function unauthorized() {
  return Response.json({ message: "Please sign in first." }, { status: 401 });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  try {
    const status = await getElevenLabsStatus(user.id);
    return Response.json(status, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { message: "Unable to load ElevenLabs configuration." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "Invalid configuration." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const apiKey = input.apiKey;
  if (apiKey !== undefined && typeof apiKey !== "string") {
    return Response.json({ message: "Invalid API key." }, { status: 400 });
  }

  try {
    const status = await saveElevenLabsConfiguration(
      user.id,
      apiKey as string | undefined,
      { voiceId: input.voiceId, modelId: input.modelId, voices: input.voices },
    );
    return Response.json(status, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message =
      error instanceof Error &&
      (error.message === "Invalid ElevenLabs voice ID." ||
        error.message === "Invalid ElevenLabs model ID." ||
        error.message === "Invalid ElevenLabs API key." ||
        error.message === "An ElevenLabs API key is required.")
        ? "Please check your API key, Voice ID, and model name."
        : "Unable to save ElevenLabs configuration.";
    const status = message.startsWith("Please check") ? 400 : 500;
    return Response.json({ message }, { status });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return unauthorized();

  try {
    const status = await deleteElevenLabsConfiguration(user.id);
    return Response.json(status, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json(
      { message: "Unable to disconnect ElevenLabs." },
      { status: 500 },
    );
  }
}
