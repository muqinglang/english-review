import { currentUser } from "@/lib/auth";
import {
  deleteDeepSeekConfiguration,
  getDeepSeekStatus,
  saveDeepSeekConfiguration,
} from "@/lib/deepseek";

export const runtime = "nodejs";

function unauthorized() {
  return Response.json({ message: "Please sign in first." }, { status: 401 });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();

  try {
    const status = await getDeepSeekStatus(user.id);
    return Response.json(status, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ message: "Unable to load DeepSeek configuration." }, { status: 500 });
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
    const status = await saveDeepSeekConfiguration(user.id, apiKey as string | undefined, { modelId: input.modelId });
    return Response.json(status, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof Error &&
      (error.message === "Invalid DeepSeek configuration." ||
        error.message === "Invalid DeepSeek API key." ||
        error.message === "A DeepSeek API key is required.")
        ? "Please check your API key and model name."
        : "Unable to save DeepSeek configuration.";
    const status = message.startsWith("Please check") ? 400 : 500;
    return Response.json({ message }, { status });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return unauthorized();

  try {
    const status = await deleteDeepSeekConfiguration(user.id);
    return Response.json(status, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ message: "Unable to disconnect DeepSeek." }, { status: 500 });
  }
}
