import { currentUser } from "@/lib/auth";
import {
  deleteElevenLabsConfiguration,
  getElevenLabsStatus,
  saveElevenLabsConfiguration,
} from "@/lib/elevenlabs";

export const runtime = "nodejs";

function unauthorized() {
  return Response.json({ message: "请先登录。" }, { status: 401 });
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
      { message: "无法读取 ElevenLabs 配置。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ message: "配置内容无效。" }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const apiKey = input.apiKey;
  if (apiKey !== undefined && typeof apiKey !== "string") {
    return Response.json({ message: "API Key 无效。" }, { status: 400 });
  }

  try {
    const status = await saveElevenLabsConfiguration(
      user.id,
      apiKey as string | undefined,
      { voiceId: input.voiceId, modelId: input.modelId },
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
        ? "请检查 API Key、Voice ID 和模型名称。"
        : "无法保存 ElevenLabs 配置。";
    const status = message.startsWith("请检查") ? 400 : 500;
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
      { message: "无法删除 ElevenLabs 配置。" },
      { status: 500 },
    );
  }
}
