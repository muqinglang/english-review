import { currentUser } from "@/lib/auth";
import { deleteFishAudioConfiguration, getFishAudioStatus, saveFishAudioConfiguration } from "@/lib/fish-audio";

function unauthorized() { return Response.json({ message: "Please sign in first." }, { status: 401 }); }

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try { return Response.json(await getFishAudioStatus(user.id), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ message: "Unable to load Fish Audio configuration." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ message: "Invalid configuration." }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (input.apiKey !== undefined && typeof input.apiKey !== "string") return Response.json({ message: "Invalid API key." }, { status: 400 });
  try { return Response.json(await saveFishAudioConfiguration(user.id, input.apiKey as string | undefined, { referenceId: input.referenceId, modelId: input.modelId }), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return Response.json({ message: error instanceof Error && /Invalid|required/.test(error.message) ? "Please check your API key, voice ID, and model name." : "Unable to save Fish Audio configuration." }, { status: 400 }); }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return unauthorized();
  try { return Response.json(await deleteFishAudioConfiguration(user.id), { headers: { "cache-control": "no-store" } }); }
  catch { return Response.json({ message: "Unable to disconnect Fish Audio." }, { status: 500 }); }
}
