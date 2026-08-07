import { createAdminClient } from "@/lib/supabase/admin";
import { slugify, workerTokenHash } from "@/lib/worker";

type Item = { normalizedKey: string; type: string; cue: string; answer: string; example?: string; priority?: "high" | "medium" | "low"; dueDate?: string };

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return Response.json({ message: "缺少 Worker 令牌。" }, { status: 401 });
  const admin = createAdminClient();
  const { data: device } = await admin.from("worker_devices").select("id,user_id").eq("token_hash", workerTokenHash(token)).is("revoked_at", null).maybeSingle();
  if (!device) return Response.json({ message: "Worker 令牌无效或已撤销。" }, { status: 401 });
  const body = await request.json().catch(() => null) as { space?: string; items?: Item[] } | null;
  if (!body || !Array.isArray(body.items) || body.items.length > 100) return Response.json({ message: "推送格式无效；items 必须为 1–100 条。" }, { status: 400 });
  const displayName = typeof body.space === "string" && body.space.trim() ? body.space.trim().slice(0, 80) : "General";
  const { data: space, error: spaceError } = await admin.from("knowledge_spaces").upsert({ user_id: device.user_id, slug: slugify(displayName), display_name: displayName }, { onConflict: "user_id,slug" }).select("id").single();
  if (spaceError || !space) return Response.json({ message: "无法保存知识库。" }, { status: 500 });
  const rows = body.items.map((item) => ({ user_id: device.user_id, knowledge_space_id: space.id, normalized_key: item.normalizedKey.slice(0, 240), type: item.type, cue: item.cue, answer: item.answer, example: item.example ?? null, priority: item.priority ?? "medium", next_due: item.dueDate ?? new Date().toISOString().slice(0, 10) }));
  if (rows.some((row) => !row.normalized_key || !row.cue || !row.answer)) return Response.json({ message: "每项都需要 normalizedKey、cue 与 answer。" }, { status: 400 });
  const { error } = await admin.from("learning_items").upsert(rows, { onConflict: "user_id,normalized_key", ignoreDuplicates: false });
  if (error) return Response.json({ message: "无法保存学习项。" }, { status: 500 });
  await admin.from("worker_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return Response.json({ ok: true, knowledgeSpace: displayName, accepted: rows.length });
}
